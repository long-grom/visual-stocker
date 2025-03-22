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
    
    // Track inventory by size
    const sizeInventory = {};
    uniqueSizes.forEach(size => {
      const variantsWithSize = sizeVariants.filter(v => v.size === size);
      sizeInventory[size] = variantsWithSize.reduce((sum, v) => sum + v.quantity, 0);
    });
    
    // Get common fashion sizes
    const commonSizes = ['S', 'M', 'L'];
    const hasCommonSizes = commonSizes.every(size => 
      uniqueSizes.includes(size) && sizeInventory[size] > 0
    );
    
    // Check if all sizes have at least 5 units
    const sizesWithAdequateStock = uniqueSizes.filter(size => sizeInventory[size] >= 5);
    const hasFullSizeRange = uniqueSizes.length > 0 && 
      sizesWithAdequateStock.length === uniqueSizes.length;
    
    // Calculate common sizes availability percentage
    const availableCommonSizes = commonSizes.filter(size => 
      uniqueSizes.includes(size) && sizeInventory[size] > 0
    );
    const commonSizesAvailability = commonSizes.some(s => uniqueSizes.includes(s)) 
      ? (availableCommonSizes.length / commonSizes.filter(s => uniqueSizes.includes(s)).length) * 100 
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
      uniqueSizes,
      sizeInventory,
      hasCommonSizes,
      hasFullSizeRange,
      sizesWithAdequateStock,
      commonSizesAvailability
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
      // Identify products with a full size range (all sizes have at least 5 units)
      if (product.hasFullSizeRange && product.uniqueSizes.length >= 3) {
        recommendations.promotionOpportunities.push({
          id: product.id,
          title: product.title,
          imageUrl: product.imageUrl,
          reason: `Full size range available with at least 5 units in each size`,
          inventory: product.totalInventory,
          sizes: Object.entries(product.sizeInventory)
            .map(([size, qty]) => `${size}: ${qty}`)
            .join(', ')
        });
      }
      
      // Identify products with very low stock in common sizes but stock in other sizes
      if (product.commonSizesAvailability < 50 && product.totalInventory > 10) {
        recommendations.lowStockWarnings.push({
          id: product.id,
          title: product.title,
          imageUrl: product.imageUrl,
          reason: `Limited availability in popular sizes S, M, L`,
          inventory: product.totalInventory,
          sizes: Object.entries(product.sizeInventory)
            .map(([size, qty]) => `${size}: ${qty}`)
            .join(', ')
        });
      }
      
      // Identify products with high inventory but not all sizes (potential for targeted promotions)
      if (product.totalInventory > 30 && !product.hasFullSizeRange) {
        recommendations.overstockedItems.push({
          id: product.id,
          title: product.title,
          imageUrl: product.imageUrl,
          reason: `High inventory but uneven size distribution`,
          inventory: product.totalInventory,
          sizes: Object.entries(product.sizeInventory)
            .map(([size, qty]) => `${size}: ${qty}`)
            .join(', ')
        });
      }
      
      // Identify products with balanced inventory (good stock across sizes)
      if (product.sizesWithAdequateStock.length >= 3 && product.commonSizesAvailability >= 50) {
        recommendations.balancedInventory.push({
          id: product.id,
          title: product.title,
          imageUrl: product.imageUrl,
          reason: `Good stock in ${product.sizesWithAdequateStock.length} sizes including popular sizes`,
          inventory: product.totalInventory,
          sizes: Object.entries(product.sizeInventory)
            .map(([size, qty]) => `${size}: ${qty}`)
            .join(', ')
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
                          {item.sizes && (
                            <Text variant="bodySm" color="subdued">
                              Sizes: {item.sizes}
                            </Text>
                          )}
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
                          {item.sizes && (
                            <Text variant="bodySm" color="subdued">
                              Sizes: {item.sizes}
                            </Text>
                          )}
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
                          {item.sizes && (
                            <Text variant="bodySm" color="subdued">
                              Sizes: {item.sizes}
                            </Text>
                          )}
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
                          {item.sizes && (
                            <Text variant="bodySm" color="subdued">
                              Sizes: {item.sizes}
                            </Text>
                          )}
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