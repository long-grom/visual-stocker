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
  RangeSlider,
  Button,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useState, useEffect } from "react";

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
          status
          featuredImage {
            url
            altText
          }
          variants(first: 50) {
            nodes {
              id
              title
              inventoryItem {
                id
                inventoryLevels(first: 20) {
                  edges {
                    node {
                      available
                      location {
                        id
                        name
                        active
                        fulfillsOnlineOrders
                        hasActiveInventory
                      }
                    }
                  }
                }
                tracked
                countryCodeOfOrigin
                inventoryPolicy
                inventoryManagement
              }
              selectedOptions {
                name
                value
              }
              sku
              barcode
            }
          }
        }
      }
      locations(first: 20) {
        nodes {
          id
          name
          isActive
          fulfillsOnlineOrders
          hasActiveInventory
          address {
            address1
            city
            province
            country
          }
        }
      }
    }
  `);

  const { data: { products, locations: fetchedLocations } } = await productsResponse.json();

  return json({
    products: products.nodes,
    locations: fetchedLocations.nodes
  });
};

export default function InventoryVisualization() {
  const { products, locations } = useLoaderData();
  const [selectedType, setSelectedType] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ACTIVE");
  const [lowStockThreshold, setLowStockThreshold] = useState(3);
  const [mediumStockThreshold, setMediumStockThreshold] = useState(10);
  const [showThresholds, setShowThresholds] = useState(false);
  
  // Transform data for visualization
  const inventoryData = products.map((product) => {
    const variantGroups = {};
    
    product.variants.nodes.forEach((variant) => {
      const colorOption = variant.selectedOptions.find(opt => opt.name.toLowerCase() === 'color');
      const sizeOption = variant.selectedOptions.find(opt => opt.name.toLowerCase() === 'size');
      const color = colorOption ? colorOption.value : 'Default';
      const size = sizeOption ? sizeOption.value : 'One Size';
      
      const groupKey = `${color}`;
      if (!variantGroups[groupKey]) {
        variantGroups[groupKey] = {
          color,
          sizes: {},
          totalQuantity: 0,
          locationQuantities: {},
          inventoryPolicy: variant.inventoryItem.inventoryPolicy,
          inventoryManagement: variant.inventoryItem.inventoryManagement,
          sku: variant.sku,
          barcode: variant.barcode
        };
      }
      
      if (!variantGroups[groupKey].sizes[size]) {
        variantGroups[groupKey].sizes[size] = {
          quantity: 0,
          locationQuantities: {}
        };
      }

      variant.inventoryItem.inventoryLevels.edges.forEach(edge => {
        const location = edge.node.location;
        const quantity = edge.node.available || 0;
        
        if (!variantGroups[groupKey].locationQuantities[location.id]) {
          variantGroups[groupKey].locationQuantities[location.id] = {
            name: location.name,
            quantity: 0,
            fulfillsOnlineOrders: location.fulfillsOnlineOrders,
            hasActiveInventory: location.hasActiveInventory
          };
        }
        variantGroups[groupKey].locationQuantities[location.id].quantity += quantity;
        
        if (!variantGroups[groupKey].sizes[size].locationQuantities[location.id]) {
          variantGroups[groupKey].sizes[size].locationQuantities[location.id] = {
            name: location.name,
            quantity: 0
          };
        }
        variantGroups[groupKey].sizes[size].locationQuantities[location.id].quantity += quantity;
        
        variantGroups[groupKey].sizes[size].quantity += quantity;
        variantGroups[groupKey].totalQuantity += quantity;
      });
    });

    return {
      id: product.id,
      title: product.title,
      type: product.productType,
      vendor: product.vendor,
      status: product.status,
      imageUrl: product.featuredImage?.url,
      imageAlt: product.featuredImage?.altText || product.title,
      variantGroups: Object.values(variantGroups)
    };
  });

  // Get unique values for filters
  const types = [...new Set(products.map(p => p.productType).filter(Boolean))];
  const vendors = [...new Set(products.map(p => p.vendor).filter(Boolean))];
  const locationOptions = locations
    .filter(l => l.isActive)
    .map(l => ({ value: l.id, label: l.name }));
  const statusOptions = [
    { value: "ACTIVE", label: "Active" },
    { value: "ARCHIVED", label: "Archived" },
    { value: "DRAFT", label: "Draft" },
    { value: "", label: "All Products" }
  ];

  // Filter products
  const filteredProducts = inventoryData.filter((product) => {
    if (selectedStatus && product.status !== selectedStatus) return false;
    if (selectedType && product.type !== selectedType) return false;
    if (selectedVendor && product.vendor !== selectedVendor) return false;
    if (selectedLocation) {
      // Check if any variant group has inventory at the selected location
      return product.variantGroups.some(group => 
        group.locationQuantities[selectedLocation] && 
        group.locationQuantities[selectedLocation].quantity > 0
      );
    }
    return true;
  });

  // Determine tag color based on quantity and return styles
  const getTagStyles = (quantity) => {
    if (quantity <= 0) {
      return {
        backgroundColor: '#FAD4D4',
        color: '#D72C0D',
        padding: '4px 8px',
        borderRadius: '6px',
        fontWeight: '500',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '65px',
        height: '28px',
        textAlign: 'center',
        boxShadow: '0 1px 0 rgba(0, 0, 0, 0.05)',
        border: '1px solid #FFCECB',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        margin: '0 auto'
      };
    } 
    if (quantity < lowStockThreshold) {
      return {
        backgroundColor: '#FFF4E5',
        color: '#B98900',
        padding: '4px 8px',
        borderRadius: '6px',
        fontWeight: '500',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '65px',
        height: '28px',
        textAlign: 'center',
        boxShadow: '0 1px 0 rgba(0, 0, 0, 0.05)',
        border: '1px solid #FFE3AC',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        margin: '0 auto'
      };
    } 
    if (quantity >= mediumStockThreshold) {
      return {
        backgroundColor: '#E3F1DF',
        color: '#108043',
        padding: '4px 8px',
        borderRadius: '6px',
        fontWeight: '500',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '65px',
        height: '28px',
        textAlign: 'center',
        boxShadow: '0 1px 0 rgba(0, 0, 0, 0.05)',
        border: '1px solid #BBE5B3',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        margin: '0 auto'
      };
    }
    // Medium stock (between low and medium threshold) 
    return {
      backgroundColor: '#FFF4E5', // Medium: yellow
      color: '#B98900',
      padding: '4px 8px',
      borderRadius: '6px',
      fontWeight: '500',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '65px',
      height: '28px',
      textAlign: 'center',
      boxShadow: '0 1px 0 rgba(0, 0, 0, 0.05)',
      border: '1px solid #FFE3AC',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
      boxSizing: 'border-box',
      margin: '0 auto'
    };
  };

  // Group variants by size and color 
  const groupVariantsByAttributes = (variantGroups) => {
    const sizes = new Set();
    const colors = new Set();
    
    variantGroups.forEach(group => {
      colors.add(group.color);
      Object.keys(group.sizes).forEach(size => sizes.add(size));
    });

    const sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '6XL', 'One Size'];
    const sortedSizes = Array.from(sizes).sort((a, b) => {
      const indexA = sizeOrder.indexOf(a);
      const indexB = sizeOrder.indexOf(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    return {
      sizes: sortedSizes,
      colors: Array.from(colors)
    };
  };

  useEffect(() => {
    // Save threshold values to localStorage whenever they change
    localStorage.setItem('lowStockThreshold', lowStockThreshold.toString());
    localStorage.setItem('mediumStockThreshold', mediumStockThreshold.toString());
  }, [lowStockThreshold, mediumStockThreshold]);

  return (
    <Page title="Inventory Analysis">
      <Layout>
        <Layout.Section>
          <Card>
            <Card.Section>
              <LegacyStack vertical>
                <LegacyStack distribution="equalSpacing">
                  <Select
                    label="Status"
                    options={statusOptions}
                    value={selectedStatus}
                    onChange={setSelectedStatus}
                  />
                  <Select
                    label="Type"
                    options={[{ value: "", label: "All Types" }, ...types.map(t => ({ value: t, label: t }))]}
                    value={selectedType}
                    onChange={setSelectedType}
                  />
                  <Select
                    label="Vendor"
                    options={[{ value: "", label: "All Vendors" }, ...vendors.map(v => ({ value: v, label: v }))]}
                    value={selectedVendor}
                    onChange={setSelectedVendor}
                  />
                  <Select
                    label="Location"
                    options={[{ value: "", label: "All Locations" }, ...locationOptions]}
                    value={selectedLocation}
                    onChange={setSelectedLocation}
                  />
                </LegacyStack>
                <ButtonGroup>
                  <Button onClick={() => setShowThresholds(!showThresholds)}>
                    {showThresholds ? "Hide Thresholds" : "Show Thresholds"}
                  </Button>
                </ButtonGroup>
                {showThresholds && (
                  <LegacyStack distribution="equalSpacing">
                    <RangeSlider
                      label="Low Stock Threshold"
                      value={lowStockThreshold}
                      onChange={setLowStockThreshold}
                      min={0}
                      max={20}
                      output
                    />
                    <RangeSlider
                      label="Medium Stock Threshold"
                      value={mediumStockThreshold}
                      onChange={setMediumStockThreshold}
                      min={0}
                      max={20}
                      output
                    />
                  </LegacyStack>
                )}
              </LegacyStack>
            </Card.Section>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Card>
            <Card.Section>
              <LegacyStack vertical>
                {filteredProducts.map((product) => {
                  const { sizes, colors } = groupVariantsByAttributes(product.variantGroups);
                  return (
                    <Box key={product.id} padding="4">
                      <LegacyStack>
                        <Thumbnail
                          source={product.imageUrl}
                          alt={product.imageAlt}
                          size="large"
                        />
                        <Box>
                          <Text variant="headingMd" as="h3">{product.title}</Text>
                          <Text variant="bodySm" as="p" color="subdued">
                            {product.type} • {product.vendor}
                          </Text>
                          {selectedLocation && (
                            <Badge status="info">
                              {product.variantGroups[0]?.locationQuantities[selectedLocation]?.name || 'Location not available'}
                            </Badge>
                          )}
                        </Box>
                      </LegacyStack>
                      <Box paddingBlockStart="4">
                        <LegacyStack vertical>
                          {colors.map((color) => {
                            const group = product.variantGroups.find(g => g.color === color);
                            return (
                              <Box key={color}>
                                <Text variant="headingSm" as="h4">{color}</Text>
                                <LegacyStack>
                                  {sizes.map((size) => {
                                    const sizeData = group.sizes[size];
                                    const quantity = sizeData?.quantity || 0;
                                    return (
                                      <Box key={size} padding="2">
                                        <Text variant="bodySm" as="p">{size}</Text>
                                        <div style={getTagStyles(quantity)}>
                                          {quantity}
                                        </div>
                                        {selectedLocation && sizeData?.locationQuantities[selectedLocation] && (
                                          <Text variant="bodySm" as="p" color="subdued">
                                            {sizeData.locationQuantities[selectedLocation].quantity} at {sizeData.locationQuantities[selectedLocation].name}
                                          </Text>
                                        )}
                                      </Box>
                                    );
                                  })}
                                </LegacyStack>
                              </Box>
                            );
                          })}
                        </LegacyStack>
                      </Box>
                    </Box>
                  );
                })}
              </LegacyStack>
            </Card.Section>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 