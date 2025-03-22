import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Select,
  ButtonGroup,
  Text,
  Box,
  LegacyStack,
  Thumbnail,
  Tag,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useState } from "react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Fetch locations
  const locationsResponse = await admin.graphql(`
    query {
      locations(first: 10) {
        nodes {
          id
          name
          isActive
        }
      }
    }
  `);

  const { data: { locations } } = await locationsResponse.json();

  // Fetch products 
  const productsResponse = await admin.graphql(`
    query {
      products(first: 50) {
        nodes {
          id
          title
          productType
          vendor
          featuredImage {
            url
            altText
          }
          variants(first: 50) {
            nodes {
              id
              title
              inventoryQuantity
              selectedOptions {
                name
                value
              }
            }
          }
        }
      }
    }
  `);

  const { data: { products } } = await productsResponse.json();

  return json({
    products: products.nodes,
    locations: locations.nodes
  });
};

export default function InventoryVisualization() {
  const { products, locations } = useLoaderData();
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  
  // Transform data for visualization
  const inventoryData = products.map((product) => ({
    id: product.id,
    title: product.title,
    type: product.productType,
    vendor: product.vendor,
    imageUrl: product.featuredImage?.url,
    imageAlt: product.featuredImage?.altText || product.title,
    variants: product.variants.nodes.map((variant) => {
      const options = variant.selectedOptions.reduce(
        (acc, opt) => ({ ...acc, [opt.name.toLowerCase()]: opt.value }),
        {}
      );
      
      return {
        id: variant.id,
        title: variant.title,
        quantity: variant.inventoryQuantity || 0,
        ...options,
      };
    }),
  }));

  // Get unique values for filters
  const sizes = [...new Set(products.flatMap(p => p.variants.nodes.flatMap(v => 
    v.selectedOptions.filter(o => o.name.toLowerCase() === 'size').map(o => o.value)
  )))];
  const colors = [...new Set(products.flatMap(p => p.variants.nodes.flatMap(v => 
    v.selectedOptions.filter(o => o.name.toLowerCase() === 'color').map(o => o.value)
  )))];
  const types = [...new Set(products.map(p => p.productType).filter(Boolean))];
  const vendors = [...new Set(products.map(p => p.vendor).filter(Boolean))];
  const locationOptions = locations
    .filter(l => l.isActive)
    .map(l => ({ value: l.id, label: l.name }));

  // Filter products
  const filteredProducts = inventoryData.filter((product) => {
    if (selectedType && product.type !== selectedType) return false;
    if (selectedVendor && product.vendor !== selectedVendor) return false;
    
    const hasMatchingVariant = product.variants.some(variant => {
      if (selectedSize && variant.size !== selectedSize) return false;
      if (selectedColor && variant.color !== selectedColor) return false;
      return true;
    });
    
    return hasMatchingVariant;
  });

  // Determine tag color based on quantity
  const getTagColor = (quantity) => {
    if (quantity <= 0) return "critical";
    if (quantity < 5) return "warning";
    if (quantity > 10) return "success";
    return "default";
  };

  return (
    <Page title="Inventory Collection View">
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="4">
              <LegacyStack vertical>
                <Text variant="headingMd">Filter Products</Text>
                <LegacyStack wrap>
                  <Select
                    label="Product Type"
                    options={[
                      { label: "All Types", value: "" },
                      ...types.map((type) => ({ label: type, value: type })),
                    ]}
                    onChange={setSelectedType}
                    value={selectedType}
                  />
                  <Select
                    label="Vendor"
                    options={[
                      { label: "All Vendors", value: "" },
                      ...vendors.map((vendor) => ({ label: vendor, value: vendor })),
                    ]}
                    onChange={setSelectedVendor}
                    value={selectedVendor}
                  />
                  <Select
                    label="Size"
                    options={[
                      { label: "All Sizes", value: "" },
                      ...sizes.map((size) => ({ label: size, value: size })),
                    ]}
                    onChange={setSelectedSize}
                    value={selectedSize}
                  />
                  <Select
                    label="Color"
                    options={[
                      { label: "All Colors", value: "" },
                      ...colors.map((color) => ({ label: color, value: color })),
                    ]}
                    onChange={setSelectedColor}
                    value={selectedColor}
                  />
                  <Select
                    label="Warehouse Location"
                    options={[
                      { label: "All Locations", value: "" },
                      ...locationOptions,
                    ]}
                    onChange={setSelectedLocation}
                    value={selectedLocation}
                  />
                </LegacyStack>
              </LegacyStack>
            </Box>
          </Card>
        </Layout.Section>
        
        <Layout.Section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
            {filteredProducts.map((product) => (
              <Card key={product.id}>
                <Box padding="4">
                  <LegacyStack vertical spacing="4">
                    <div style={{ aspectRatio: "1", position: "relative" }}>
                      <Thumbnail
                        source={product.imageUrl || ""}
                        alt={product.imageAlt}
                        size="large"
                      />
                    </div>
                    <LegacyStack vertical spacing="2">
                      <Text variant="headingSm" as="h3">
                        {product.title}
                      </Text>
                      <LegacyStack>
                        <Badge>{product.type}</Badge>
                        <Badge status="info">{product.vendor}</Badge>
                        {selectedLocation && (
                          <Badge status="success">
                            {locationOptions.find(l => l.value === selectedLocation)?.label}
                          </Badge>
                        )}
                      </LegacyStack>
                      <LegacyStack wrap>
                        {product.variants.map((variant) => {
                          const quantity = variant.quantity;
                          const tagColor = getTagColor(quantity);
                          
                          return (
                            <Tag key={variant.id} color={tagColor}>
                              {`${variant.size || ''} ${variant.color || ''}: ${quantity}`}
                            </Tag>
                          );
                        })}
                      </LegacyStack>
                    </LegacyStack>
                  </LegacyStack>
                </Box>
              </Card>
            ))}
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 