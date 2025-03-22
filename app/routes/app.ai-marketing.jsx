import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Box,
  LegacyStack,
  Thumbnail,
  Banner,
  List,
  Divider,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Fetch products with inventory data
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
    products: products.nodes
  });
};

export default function AIMarketingRecommendations() {
  const { products } = useLoaderData();
  
  // Transform data for analysis
  const productData = products.map((product) => {
    const variants = product.variants.nodes.map((variant) => {
      const options = variant.selectedOptions.reduce(
        (acc, opt) => ({ ...acc, [opt.name.toLowerCase()]: opt.value }),
        {}
      );
      
      return {
        id: variant.id,
        title: variant.title,
        quantity: variant.inventoryQuantity,
        size: options.size,
        color: options.color,
      };
    });

    // Calculate total inventory
    const totalInventory = variants.reduce((sum, variant) => sum + variant.quantity, 0);
    
    // Calculate sizes availability percentage
    const sizeVariants = variants.filter(v => v.size);
    const uniqueSizes = [...new Set(sizeVariants.map(v => v.size))];
    const sizesWithStock = uniqueSizes.filter(size => 
      sizeVariants.find(v => v.size === size && v.quantity > 0)
    );
    const sizeAvailabilityPercentage = uniqueSizes.length > 0 
      ? (sizesWithStock.length / uniqueSizes.length) * 100 
      : 0;
    
    return {
      id: product.id,
      title: product.title,
      type: product.productType,
      vendor: product.vendor,
      imageUrl: product.featuredImage?.url,
      imageAlt: product.featuredImage?.altText || product.title,
      variants,
      totalInventory,
      sizeAvailabilityPercentage,
      sizesCount: uniqueSizes.length,
      sizesWithStockCount: sizesWithStock.length
    };
  });

  // Generate marketing recommendations
  const generateRecommendations = (productData) => {
    const recommendations = {
      promotionOpportunities: [],
      lowStockWarnings: [],
      balancedInventory: [],
      overstockedItems: []
    };

    productData.forEach(product => {
      // Identify products with good size availability (balanced inventory)
      if (product.sizeAvailabilityPercentage >= 80 && product.sizesCount >= 3) {
        recommendations.balancedInventory.push({
          id: product.id,
          title: product.title,
          imageUrl: product.imageUrl,
          reason: `${product.sizesWithStockCount} out of ${product.sizesCount} sizes in stock`,
          inventory: product.totalInventory
        });
      }
      
      // Identify products with very low stock across sizes
      if (product.sizeAvailabilityPercentage <= 30 && product.totalInventory > 0) {
        recommendations.lowStockWarnings.push({
          id: product.id,
          title: product.title,
          imageUrl: product.imageUrl,
          reason: `Only ${product.sizesWithStockCount} out of ${product.sizesCount} sizes in stock`,
          inventory: product.totalInventory
        });
      }
      
      // Identify products with high inventory (potential for promotions)
      if (product.totalInventory > 30) {
        recommendations.overstockedItems.push({
          id: product.id,
          title: product.title,
          imageUrl: product.imageUrl,
          reason: `High inventory level: ${product.totalInventory} units`,
          inventory: product.totalInventory
        });
      }
      
      // Identify specific promotion opportunities
      if (product.totalInventory > 15 && product.sizeAvailabilityPercentage >= 50) {
        recommendations.promotionOpportunities.push({
          id: product.id,
          title: product.title,
          imageUrl: product.imageUrl,
          reason: `Good inventory levels with ${product.sizesWithStockCount} sizes available`,
          inventory: product.totalInventory
        });
      }
    });

    // Sort recommendations by inventory levels
    recommendations.promotionOpportunities.sort((a, b) => b.inventory - a.inventory);
    recommendations.overstockedItems.sort((a, b) => b.inventory - a.inventory);
    recommendations.balancedInventory.sort((a, b) => b.inventory - a.inventory);
    recommendations.lowStockWarnings.sort((a, b) => a.inventory - b.inventory);

    return recommendations;
  };

  const recommendations = generateRecommendations(productData);

  return (
    <Page title="AI Marketing Recommendations">
      <Layout>
        <Layout.Section>
          <Banner
            title="Inventory-Based Marketing Recommendations"
            status="info"
          >
            <p>These recommendations are generated based on your current inventory levels across different products, sizes, and colors.</p>
          </Banner>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="4">
              <Text variant="headingLg">Promotional Opportunities</Text>
              <Box paddingBlockStart="4">
                <Text color="subdued">
                  Products with good inventory levels that are prime for marketing campaigns
                </Text>
              </Box>
              <Box paddingBlockStart="4">
                {recommendations.promotionOpportunities.length === 0 ? (
                  <Text>No promotional opportunities identified at this time.</Text>
                ) : (
                  <List type="bullet">
                    {recommendations.promotionOpportunities.map((item) => (
                      <List.Item key={item.id}>
                        <LegacyStack alignment="center" spacing="tight">
                          {item.imageUrl && (
                            <Thumbnail
                              source={item.imageUrl}
                              alt={item.title}
                              size="small"
                            />
                          )}
                          <Text variant="bodyMd" fontWeight="bold">
                            {item.title}
                          </Text>
                          <Text variant="bodySm" color="subdued">
                            - {item.reason}
                          </Text>
                        </LegacyStack>
                      </List.Item>
                    ))}
                  </List>
                )}
              </Box>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="4">
              <Text variant="headingLg">Overstocked Items</Text>
              <Box paddingBlockStart="4">
                <Text color="subdued">
                  Products with high inventory levels that should be prioritized in marketing
                </Text>
              </Box>
              <Box paddingBlockStart="4">
                {recommendations.overstockedItems.length === 0 ? (
                  <Text>No overstocked items identified at this time.</Text>
                ) : (
                  <List type="bullet">
                    {recommendations.overstockedItems.map((item) => (
                      <List.Item key={item.id}>
                        <LegacyStack alignment="center" spacing="tight">
                          {item.imageUrl && (
                            <Thumbnail
                              source={item.imageUrl}
                              alt={item.title}
                              size="small"
                            />
                          )}
                          <Text variant="bodyMd" fontWeight="bold">
                            {item.title}
                          </Text>
                          <Text variant="bodySm" color="subdued">
                            - {item.reason}
                          </Text>
                        </LegacyStack>
                      </List.Item>
                    ))}
                  </List>
                )}
              </Box>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="4">
              <Text variant="headingLg">Well-Balanced Inventory</Text>
              <Box paddingBlockStart="4">
                <Text color="subdued">
                  Products with good size availability - ideal for general marketing
                </Text>
              </Box>
              <Box paddingBlockStart="4">
                {recommendations.balancedInventory.length === 0 ? (
                  <Text>No well-balanced inventory identified at this time.</Text>
                ) : (
                  <List type="bullet">
                    {recommendations.balancedInventory.map((item) => (
                      <List.Item key={item.id}>
                        <LegacyStack alignment="center" spacing="tight">
                          {item.imageUrl && (
                            <Thumbnail
                              source={item.imageUrl}
                              alt={item.title}
                              size="small"
                            />
                          )}
                          <Text variant="bodyMd" fontWeight="bold">
                            {item.title}
                          </Text>
                          <Text variant="bodySm" color="subdued">
                            - {item.reason}
                          </Text>
                        </LegacyStack>
                      </List.Item>
                    ))}
                  </List>
                )}
              </Box>
            </Box>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <Card>
            <Box padding="4">
              <Text variant="headingLg">Low Stock Warnings</Text>
              <Box paddingBlockStart="4">
                <Text color="subdued">
                  Products with limited size availability - avoid featuring in marketing
                </Text>
              </Box>
              <Box paddingBlockStart="4">
                {recommendations.lowStockWarnings.length === 0 ? (
                  <Text>No low stock warnings identified at this time.</Text>
                ) : (
                  <List type="bullet">
                    {recommendations.lowStockWarnings.map((item) => (
                      <List.Item key={item.id}>
                        <LegacyStack alignment="center" spacing="tight">
                          {item.imageUrl && (
                            <Thumbnail
                              source={item.imageUrl}
                              alt={item.title}
                              size="small"
                            />
                          )}
                          <Text variant="bodyMd" fontWeight="bold">
                            {item.title}
                          </Text>
                          <Text variant="bodySm" color="subdued">
                            - {item.reason}
                          </Text>
                        </LegacyStack>
                      </List.Item>
                    ))}
                  </List>
                )}
              </Box>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 