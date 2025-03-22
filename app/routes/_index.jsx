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
  RangeSlider,
  Button,
  Collapsible,
  Icon,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useState } from "react";

// Helper function to determine inventory level and color
const getInventoryLevel = (quantity, lowThreshold, mediumThreshold) => {
  console.log(`Checking quantity ${quantity} against thresholds: low=${lowThreshold}, medium=${mediumThreshold}`);
  if (quantity <= lowThreshold) {
    return { level: 'Low', color: 'rgb(222, 54, 24)' };  // red
  } else if (quantity <= mediumThreshold) {
    return { level: 'Medium', color: 'rgb(185, 137, 0)' };  // yellow
  } else {
    return { level: 'High', color: 'rgb(0, 127, 95)' };  // green
  }
};

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
  const [selectedVendor, setSelectedVendor] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  
  // Inventory threshold states
  const [lowThreshold, setLowThreshold] = useState(2);
  const [mediumThreshold, setMediumThreshold] = useState(5);
  
  // Transform data for visualization
  const inventoryData = products.map((product) => {
    // Group variants by size
    const variantsBySize = {};
    product.variants.nodes.forEach((variant) => {
      const size = variant.selectedOptions.find(opt => opt.name === 'Size')?.value || '';
      if (!variantsBySize[size]) {
        variantsBySize[size] = {
          size,
          quantity: variant.inventoryQuantity || 0
        };
      }
    });

    return {
      id: product.id,
      title: product.title,
      type: product.productType,
      vendor: product.vendor,
      imageUrl: product.featuredImage?.url,
      imageAlt: product.featuredImage?.altText || product.title,
      variants: Object.values(variantsBySize),
    };
  });

  // Get unique values for filters
  const sizes = [...new Set(products.flatMap(p => 
    p.variants.nodes.flatMap(v => 
      v.selectedOptions.filter(o => o.name === 'Size').map(o => o.value)
    )
  ))].sort();
  const colors = [...new Set(products.flatMap(p => 
    p.variants.nodes.flatMap(v => 
      v.selectedOptions.filter(o => o.name === 'Color').map(o => o.value)
    )
  ))].sort();
  const types = [...new Set(products.map(p => p.productType).filter(Boolean))].sort();
  const vendors = [...new Set(products.map(p => p.vendor).filter(Boolean))].sort();

  // Filter products
  const filteredProducts = inventoryData.filter((product) => {
    if (selectedType && product.type !== selectedType) return false;
    if (selectedVendor && product.vendor !== selectedVendor) return false;
    
    const hasMatchingVariant = product.variants.some(variant => {
      if (selectedSize && variant.size !== selectedSize) return false;
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
                <LegacyStack alignment="center" distribution="equalSpacing">
                  <Text variant="headingMd">Filter Products</Text>
                  <Button
                    onClick={() => setShowSettings(!showSettings)}
                    plain
                  >
                    Inventory Thresholds
                  </Button>
                </LegacyStack>
                <Collapsible
                  open={showSettings}
                  id="inventory-settings"
                >
                  <Box paddingBlockStart="4" paddingBlockEnd="4">
                    <LegacyStack vertical spacing="4">
                      <Text variant="headingSm" as="h3">Inventory Level Thresholds</Text>
                      <LegacyStack vertical spacing="2">
                        <RangeSlider
                          label="Low Stock Threshold (Red)"
                          value={lowThreshold}
                          onChange={setLowThreshold}
                          min={0}
                          max={mediumThreshold}
                          output
                        />
                        <RangeSlider
                          label="Medium Stock Threshold (Yellow)"
                          value={mediumThreshold}
                          onChange={setMediumThreshold}
                          min={lowThreshold + 1}
                          max={20}
                          output
                        />
                        <LegacyStack distribution="equalSpacing">
                          <Text variant="bodySm" as="p" color="subdued">
                            🔴 Low: 0-{lowThreshold} items
                          </Text>
                          <Text variant="bodySm" as="p" color="subdued">
                            🟡 Medium: {lowThreshold + 1}-{mediumThreshold} items
                          </Text>
                          <Text variant="bodySm" as="p" color="subdued">
                            🟢 High: {mediumThreshold + 1}+ items
                          </Text>
                        </LegacyStack>
                      </LegacyStack>
                    </LegacyStack>
                  </Box>
                </Collapsible>
                <ButtonGroup>
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
                      <LegacyStack>
                        <Text variant="bodySm" as="p" color="subdued">
                          {product.type}
                        </Text>
                        <Text variant="bodySm" as="p" color="subdued">
                          •
                        </Text>
                        <Text variant="bodySm" as="p" color="subdued">
                          {product.vendor}
                        </Text>
                      </LegacyStack>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {product.variants.map((variant) => {
                          const { color } = getInventoryLevel(variant.quantity, lowThreshold, mediumThreshold);
                          console.log(`Variant ${variant.size}: quantity=${variant.quantity}, color=${color}`);
                          return (
                            <div
                              key={variant.size}
                              style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                backgroundColor: '#F6F6F7',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                minWidth: '80px'
                              }}
                            >
                              <span style={{ 
                                fontWeight: 'bold', 
                                color: `${color} !important` 
                              }}>
                                {variant.size}: {variant.quantity}
                              </span>
                            </div>
                          );
                        })}
                      </div>
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