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
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useState } from "react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Fetch inventory data with images and product type
  const response = await admin.graphql(`
    query {
      products(first: 50) {
        nodes {
          id
          title
          productType
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

  const {
    data: {
      products: { nodes: products },
    },
  } = await response.json();

  return json({ products });
};

export default function InventoryVisualization() {
  const { products } = useLoaderData();
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [selectedType, setSelectedType] = useState("");
  
  // Transform data for visualization
  const inventoryData = products.map((product) => ({
    id: product.id,
    title: product.title,
    type: product.productType,
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

  // Filter products
  const filteredProducts = inventoryData.filter((product) => {
    if (selectedType && product.type !== selectedType) return false;
    
    const hasMatchingVariant = product.variants.some(variant => {
      if (selectedSize && variant.size !== selectedSize) return false;
      if (selectedColor && variant.color !== selectedColor) return false;
      return true;
    });
    
    return hasMatchingVariant;
  });

  return (
    <Page title="Inventory Collection View">
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="4">
              <LegacyStack vertical>
                <Text variant="headingMd">Filter Products</Text>
                <ButtonGroup>
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
                </ButtonGroup>
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
                      <Text variant="bodySm" as="p" color="subdued">
                        {product.type}
                      </Text>
                      <LegacyStack wrap>
                        {product.variants.map((variant) => (
                          <Tag key={variant.id}>
                            {`${variant.size || ''} ${variant.color || ''}: ${variant.quantity}`}
                          </Tag>
                        ))}
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