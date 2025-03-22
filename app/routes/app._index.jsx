import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Box,
  Button,
  InlineStack,
  LegacyStack,
  Badge,
  Thumbnail,
  Banner,
  List
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

// Helper function to determine inventory level and badge status
const getInventoryStatus = (quantity, lowThreshold = 5, mediumThreshold = 15) => {
  if (quantity <= lowThreshold) {
    return "critical";
  } else if (quantity <= mediumThreshold) {
    return "warning";
  } else {
    return "success";
  }
};

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Fetch products with inventory data
  const response = await admin.graphql(`
    query {
      products(first: 20) {
        nodes {
          id
          title
          productType
          vendor
          featuredImage {
            url
            altText
          }
          variants(first: 20) {
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

  // Process data for dashboard display
  let lowStockCount = 0;
  let overstockCount = 0;
  let balancedCount = 0;
  let totalInventory = 0;
  let lowStockThreshold = 5;
  let mediumStockThreshold = 15;

  // Helper for size analysis
  const productData = products.map(product => {
    const sizeInventory = {};
    let productTotalInventory = 0;
    let hasCommonSizes = false;
    let hasFullSizeRange = false;
    
    // Track sizes and their inventory
    product.variants.nodes.forEach(variant => {
      const sizeOption = variant.selectedOptions.find(opt => opt.name.toLowerCase() === 'size');
      if (sizeOption) {
        const size = sizeOption.value;
        sizeInventory[size] = variant.inventoryQuantity || 0;
        productTotalInventory += (variant.inventoryQuantity || 0);
        
        // Check for common sizes (S, M, L)
        if (['S', 'M', 'L'].includes(size) && variant.inventoryQuantity > 0) {
          hasCommonSizes = true;
        }
      } else {
        // For products without size variants
        productTotalInventory += (variant.inventoryQuantity || 0);
      }
    });
    
    // Check if it has at least 5 units in each common size
    const sizesWithStock = Object.entries(sizeInventory).filter(([_, qty]) => qty >= 5);
    hasFullSizeRange = sizesWithStock.length >= 4;
    
    // Categorize products
    let status = "balanced";
    if (productTotalInventory > 30 && !hasFullSizeRange) {
      status = "overstock";
      overstockCount++;
    } else if (hasCommonSizes && hasFullSizeRange && productTotalInventory > 15) {
      status = "promotion";
      balancedCount++;
    } else if (productTotalInventory <= lowStockThreshold || 
              (hasCommonSizes && Object.keys(sizeInventory).length > 2 && sizesWithStock.length < 3)) {
      status = "lowStock";
      lowStockCount++;
    } else {
      balancedCount++;
    }
    
    totalInventory += productTotalInventory;
    
    return {
      id: product.id,
      title: product.title,
      type: product.productType,
      vendor: product.vendor,
      imageUrl: product.featuredImage?.url,
      imageAlt: product.featuredImage?.altText || product.title,
      totalInventory: productTotalInventory,
      status,
      sizeInventory
    };
  });

  // Find products for quick highlights
  const topLowStock = productData
    .filter(p => p.status === "lowStock")
    .sort((a, b) => a.totalInventory - b.totalInventory)
    .slice(0, 3);
    
  const topOpportunities = productData
    .filter(p => p.status === "promotion")
    .sort((a, b) => b.totalInventory - a.totalInventory)
    .slice(0, 3);
    
  const topOverstock = productData
    .filter(p => p.status === "overstock")
    .sort((a, b) => b.totalInventory - a.totalInventory)
    .slice(0, 3);

  return json({
    inventorySummary: {
      total: products.length,
      totalInventory,
      lowStockCount,
      overstockCount,
      balancedCount,
      topLowStock,
      topOpportunities,
      topOverstock
    }
  });
};

export default function Index() {
  const { inventorySummary } = useLoaderData();
  
  // Format number with commas
  const formatNumber = (num) => {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  };

  return (
    <Page>
      <TitleBar title="Visual Stocker Dashboard" />
      <BlockStack gap="500">
        {/* Inventory overview section */}
        <Layout>
          {/* First column */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Inventory Overview
                </Text>
                
                <BlockStack gap="200">
                  <InlineStack gap="500" align="space-between">
                    <Text as="p" variant="bodyMd">
                      Total Products:
                    </Text>
                    <Text as="p" variant="bodyMd" fontWeight="bold">
                      {inventorySummary.total}
                    </Text>
                  </InlineStack>
                  
                  <InlineStack gap="500" align="space-between">
                    <Text as="p" variant="bodyMd">
                      Total Inventory:
                    </Text>
                    <Text as="p" variant="bodyMd" fontWeight="bold">
                      {formatNumber(inventorySummary.totalInventory)} units
                    </Text>
                  </InlineStack>
                  
                  <InlineStack gap="500" align="space-between">
                    <Text as="p" variant="bodyMd">
                      Low Stock Products:
                    </Text>
                    <Badge status="critical">{inventorySummary.lowStockCount}</Badge>
                  </InlineStack>
                  
                  <InlineStack gap="500" align="space-between">
                    <Text as="p" variant="bodyMd">
                      Overstocked Products:
                    </Text>
                    <Badge status="warning">{inventorySummary.overstockCount}</Badge>
                  </InlineStack>
                  
                  <InlineStack gap="500" align="space-between">
                    <Text as="p" variant="bodyMd">
                      Balanced Inventory:
                    </Text>
                    <Badge status="success">{inventorySummary.balancedCount}</Badge>
                  </InlineStack>
                </BlockStack>
                
                <InlineStack gap="300">
                  <Button primary url="/app/inventory">
                    View Detailed Analysis
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          
          {/* Second column */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Marketing Opportunities
                </Text>
                
                <Banner
                  title={`${inventorySummary.topOpportunities.length} products ready for promotion`}
                  status="success"
                >
                  <p>Products with balanced inventory across sizes</p>
                </Banner>
                
                <Banner
                  title={`${inventorySummary.topOverstock.length} overstocked products`}
                  status="warning"
                >
                  <p>Products with high inventory in certain sizes</p>
                </Banner>
                
                <InlineStack gap="300">
                  <Button primary url="/app/marketing">
                    View Marketing Recommendations
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
        
        {/* Highlight sections */}
        <Layout>
          {/* Low stock highlights */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Low Stock Items
                </Text>
                
                {inventorySummary.topLowStock.length > 0 ? (
                  <BlockStack gap="400">
                    {inventorySummary.topLowStock.map(product => (
                      <InlineStack key={product.id} gap="400" align="center">
                        {product.imageUrl && (
                          <Thumbnail
                            source={product.imageUrl}
                            alt={product.imageAlt}
                            size="small"
                          />
                        )}
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="bold">
                            {product.title}
                          </Text>
                          <Text variant="bodySm">
                            Total inventory: {product.totalInventory} units
                          </Text>
                        </BlockStack>
                        <Badge status="critical">Low Stock</Badge>
                      </InlineStack>
                    ))}
                    <Button plain url="/app/inventory">
                      View all low stock items →
                    </Button>
                  </BlockStack>
                ) : (
                  <Text variant="bodyMd">No low stock items found.</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
          
          {/* Promotion opportunities */}
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Promotion Opportunities
                </Text>
                
                {inventorySummary.topOpportunities.length > 0 ? (
                  <BlockStack gap="400">
                    {inventorySummary.topOpportunities.map(product => (
                      <InlineStack key={product.id} gap="400" align="center">
                        {product.imageUrl && (
                          <Thumbnail
                            source={product.imageUrl}
                            alt={product.imageAlt}
                            size="small"
                          />
                        )}
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="bold">
                            {product.title}
                          </Text>
                          <Text variant="bodySm">
                            Inventory across sizes: {product.totalInventory} units
                          </Text>
                        </BlockStack>
                        <Badge status="success">Ready to Promote</Badge>
                      </InlineStack>
                    ))}
                    <Button plain url="/app/marketing">
                      View all promotion opportunities →
                    </Button>
                  </BlockStack>
                ) : (
                  <Text variant="bodyMd">No promotion opportunities found.</Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
