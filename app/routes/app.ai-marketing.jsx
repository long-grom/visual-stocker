import { json } from "@remix-run/node";
import { useLoaderData, useSubmit } from "@remix-run/react";
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
  Select,
  Filters,
  Button,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useEffect, useState } from "react";

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
      locations(first: 10, query: "active:true") {
        nodes {
          id
          name
          isActive
        }
      }
    }
  `);

  const { data } = await productsResponse.json();

  return json({
    products: data.products.nodes,
    locations: data.locations.nodes
  });
};

export default function AIMarketingRecommendations() {
  const { products, locations } = useLoaderData();
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [selectedProductType, setSelectedProductType] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [filteredProductData, setFilteredProductData] = useState([]);
  const [recommendations, setRecommendations] = useState({
    promotionOpportunities: [],
    lowStockWarnings: [],
    balancedInventory: [],
    overstockedItems: []
  });
  
  // Inventory threshold state - with defaults that will be overridden if stored values exist
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [mediumStockThreshold, setMediumStockThreshold] = useState(15);

  // Load threshold values from localStorage (if available)
  useEffect(() => {
    // Get stored values on component mount
    const storedLowThreshold = localStorage.getItem('lowStockThreshold');
    const storedMediumThreshold = localStorage.getItem('mediumStockThreshold');
    
    if (storedLowThreshold) {
      setLowStockThreshold(parseInt(storedLowThreshold, 10));
    }
    
    if (storedMediumThreshold) {
      setMediumStockThreshold(parseInt(storedMediumThreshold, 10));
    }
  }, []);

  // Function to get tag color based on inventory level
  const getTagColor = (quantity) => {
    if (quantity <= lowStockThreshold) {
      return 'critical'; // Red
    } else if (quantity <= mediumStockThreshold) {
      return 'warning';  // Yellow/Orange
    } else {
      return 'success';  // Green
    }
  };

  // Get tag style based on inventory level - custom styling to match inventory page
  const getTagStyles = (quantity) => {
    if (quantity <= lowStockThreshold) {
      return {
        backgroundColor: '#FAD4D4',
        color: '#D72C0D',
        padding: '1px 4px',
        borderRadius: '6px',
        fontWeight: '500',
        display: 'inline-block',
        textAlign: 'center',
        boxShadow: '0 1px 0 rgba(0, 0, 0, 0.05)',
        border: '1px solid #FFCECB',
        margin: '1px',
        minWidth: '50px'
      };
    } else if (quantity <= mediumStockThreshold) {
      return {
        backgroundColor: '#FFF4E5',
        color: '#B98900',
        padding: '1px 4px',
        borderRadius: '6px',
        fontWeight: '500',
        display: 'inline-block',
        textAlign: 'center',
        boxShadow: '0 1px 0 rgba(0, 0, 0, 0.05)',
        border: '1px solid #FFE3AC',
        margin: '1px',
        minWidth: '50px'
      };
    } else {
      return {
        backgroundColor: '#E3F1DF',
        color: '#108043',
        padding: '1px 4px',
        borderRadius: '6px',
        fontWeight: '500',
        display: 'inline-block',
        textAlign: 'center',
        boxShadow: '0 1px 0 rgba(0, 0, 0, 0.05)',
        border: '1px solid #BBE5B3',
        margin: '1px',
        minWidth: '50px'
      };
    }
  };

  // Function to format sizes with color coding
  const formatSizesWithColors = (sizeString) => {
    if (!sizeString) return null;
    
    const sizeEntries = sizeString.split(', ').map(entry => {
      const [size, qtyStr] = entry.split(': ');
      const quantity = parseInt(qtyStr, 10);
      return { size, quantity };
    });
    
    return (
      <LegacyStack spacing="tight" wrap={true}>
        {sizeEntries.map((entry, index) => (
          <div key={index} style={getTagStyles(entry.quantity)}>
            {entry.size}: {entry.quantity}
          </div>
        ))}
      </LegacyStack>
    );
  };

  // Extract unique vendors and product types
  const vendors = ['all', ...new Set(products.map(product => product.vendor).filter(Boolean))];
  const productTypes = ['all', ...new Set(products.map(product => product.productType).filter(Boolean))];
  
  // Prepare location options
  const locationOptions = [
    { label: 'All Locations', value: 'all' },
    ...locations.map(location => ({
      label: location.name,
      value: location.id
    }))
  ];
  
  // Transform data for analysis
  const transformProductData = () => {
    // Filter products based on selected vendor and product type
    let filteredProducts = [...products];
    
    if (selectedVendor !== 'all') {
      filteredProducts = filteredProducts.filter(product => product.vendor === selectedVendor);
    }
    
    if (selectedProductType !== 'all') {
      filteredProducts = filteredProducts.filter(product => product.productType === selectedProductType);
    }
    
    // We'll apply location filtering in our recommendations display logic below
    // since we need to keep all inventory data for proper analysis
    
    return filteredProducts.map((product) => {
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
  };

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
            .join(', '),
          vendor: product.vendor,
          type: product.type
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
            .join(', '),
          vendor: product.vendor,
          type: product.type
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
            .join(', '),
          vendor: product.vendor,
          type: product.type
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
            .join(', '),
          vendor: product.vendor,
          type: product.type
        });
      }
    });

    // Sort recommendations by inventory levels
    recommendations.promotionOpportunities.sort((a, b) => b.inventory - a.inventory);
    recommendations.overstockedItems.sort((a, b) => b.inventory - a.inventory);
    recommendations.balancedInventory.sort((a, b) => b.inventory - a.inventory);
    recommendations.lowStockWarnings.sort((a, b) => a.inventory - b.inventory);

    // If a specific location is selected, filter the recommendations
    // This is a simplified approach; for a real implementation we would need to
    // fetch inventory levels by location from the Shopify API
    if (selectedLocation !== 'all') {
      const selectedLocationName = locations.find(loc => loc.id === selectedLocation)?.name || '';
      
      // For demonstration purposes, we'll filter recommendations by excluding
      // certain products based on the location ID (simulating location-specific inventory)
      // In a real implementation, you would query inventory levels by location
      const filterByLocationSimulation = (items) => {
        // This is a placeholder for actual location-based filtering
        // In a real implementation, you would check actual inventory at each location
        return items.filter(item => {
          // Use the product ID and location ID to create a deterministic filter for demo
          const productIdNum = parseInt(item.id.split('/').pop());
          const locationIdNum = parseInt(selectedLocation.split('/').pop());
          
          // Simple hash function to deterministically filter items by location
          return (productIdNum + locationIdNum) % 3 !== 0;
        });
      };
      
      recommendations.promotionOpportunities = filterByLocationSimulation(recommendations.promotionOpportunities);
      recommendations.overstockedItems = filterByLocationSimulation(recommendations.overstockedItems);
      recommendations.balancedInventory = filterByLocationSimulation(recommendations.balancedInventory);
      recommendations.lowStockWarnings = filterByLocationSimulation(recommendations.lowStockWarnings);
      
      // Add location info to recommendations
      Object.keys(recommendations).forEach(key => {
        recommendations[key].forEach(item => {
          item.locationInfo = `Filtered by location: ${selectedLocationName}`;
        });
      });
    }

    return recommendations;
  };

  // Handle filter changes
  const handleVendorChange = (value) => {
    setSelectedVendor(value);
  };

  const handleProductTypeChange = (value) => {
    setSelectedProductType(value);
  };

  const handleLocationChange = (value) => {
    setSelectedLocation(value);
  };

  const handleResetFilters = () => {
    setSelectedVendor('all');
    setSelectedProductType('all');
    setSelectedLocation('all');
  };

  useEffect(() => {
    const transformedData = transformProductData();
    setFilteredProductData(transformedData);
    setRecommendations(generateRecommendations(transformedData));
  }, [selectedVendor, selectedProductType, selectedLocation]);

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
              <Text variant="headingMd">Filter Recommendations</Text>
              <Box paddingBlockStart="4">
                <LegacyStack distribution="fill" alignment="trailing" wrap={false}>
                  <div style={{ minWidth: '200px', paddingRight: '12px' }}>
                    <Select
                      label="Vendor"
                      options={vendors.map(vendor => ({ label: vendor === 'all' ? 'All Vendors' : vendor, value: vendor }))}
                      onChange={handleVendorChange}
                      value={selectedVendor}
                    />
                  </div>
                  <div style={{ minWidth: '200px', paddingRight: '12px' }}>
                    <Select
                      label="Product Type"
                      options={productTypes.map(type => ({ label: type === 'all' ? 'All Product Types' : type, value: type }))}
                      onChange={handleProductTypeChange}
                      value={selectedProductType}
                    />
                  </div>
                  <div style={{ minWidth: '200px', paddingRight: '12px' }}>
                    <Select
                      label="Warehouse Location"
                      options={locationOptions}
                      onChange={handleLocationChange}
                      value={selectedLocation}
                    />
                  </div>
                  <div style={{ alignSelf: 'flex-end', paddingBottom: '4px' }}>
                    <Button onClick={handleResetFilters}>Reset Filters</Button>
                  </div>
                </LegacyStack>
              </Box>
            </Box>
          </Card>
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
                          <div>
                            <Text variant="bodyMd" fontWeight="bold">
                              {item.title}
                            </Text>
                            <Text variant="bodySm" color="subdued">
                              {item.reason}
                            </Text>
                            {item.sizes && formatSizesWithColors(item.sizes)}
                            {item.locationInfo && (
                              <Text variant="bodySm" color="subdued">
                                {item.locationInfo}
                              </Text>
                            )}
                          </div>
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
                          <div>
                            <Text variant="bodyMd" fontWeight="bold">
                              {item.title}
                            </Text>
                            <Text variant="bodySm" color="subdued">
                              {item.reason}
                            </Text>
                            {item.sizes && formatSizesWithColors(item.sizes)}
                            {item.locationInfo && (
                              <Text variant="bodySm" color="subdued">
                                {item.locationInfo}
                              </Text>
                            )}
                          </div>
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
                          <div>
                            <Text variant="bodyMd" fontWeight="bold">
                              {item.title}
                            </Text>
                            <Text variant="bodySm" color="subdued">
                              {item.reason}
                            </Text>
                            {item.sizes && formatSizesWithColors(item.sizes)}
                            {item.locationInfo && (
                              <Text variant="bodySm" color="subdued">
                                {item.locationInfo}
                              </Text>
                            )}
                          </div>
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
                          <div>
                            <Text variant="bodyMd" fontWeight="bold">
                              {item.title}
                            </Text>
                            <Text variant="bodySm" color="subdued">
                              {item.reason}
                            </Text>
                            {item.sizes && formatSizesWithColors(item.sizes)}
                            {item.locationInfo && (
                              <Text variant="bodySm" color="subdued">
                                {item.locationInfo}
                              </Text>
                            )}
                          </div>
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