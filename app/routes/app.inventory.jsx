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
  const [selectedType, setSelectedType] = useState("");
  const [selectedVendor, setSelectedVendor] = useState("");
  const [selectedLocation, setSelectedLocation] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("ACTIVE");
  const [lowStockThreshold, setLowStockThreshold] = useState(3);
  const [mediumStockThreshold, setMediumStockThreshold] = useState(10);
  const [showThresholds, setShowThresholds] = useState(false);
  
  // Transform data for visualization
  const inventoryData = products.map((product) => ({
    id: product.id,
    title: product.title,
    type: product.productType,
    vendor: product.vendor,
    status: product.status,
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

  // Get the styled sample tags for thresholds
  const getLowStockStyle = {
    backgroundColor: '#FAD4D4',
    color: '#D72C0D',
    padding: '4px 8px',
    borderRadius: '6px',
    fontWeight: '500',
    display: 'inline-block',
    margin: '2px',
    width: '120px',
    textAlign: 'center',
    boxShadow: '0 1px 0 rgba(0, 0, 0, 0.05)',
    border: '1px solid #FFCECB'
  };

  const getMediumStockStyle = {
    backgroundColor: '#FFF4E5',
    color: '#B98900',
    padding: '4px 8px',
    borderRadius: '6px',
    fontWeight: '500',
    display: 'inline-block',
    margin: '2px',
    width: '120px',
    textAlign: 'center',
    boxShadow: '0 1px 0 rgba(0, 0, 0, 0.05)',
    border: '1px solid #FFE3AC'
  };

  const getHighStockStyle = {
    backgroundColor: '#E3F1DF',
    color: '#108043',
    padding: '4px 8px',
    borderRadius: '6px',
    fontWeight: '500',
    display: 'inline-block',
    margin: '2px',
    width: '120px',
    textAlign: 'center',
    boxShadow: '0 1px 0 rgba(0, 0, 0, 0.05)',
    border: '1px solid #BBE5B3'
  };

  // Group variants by size and color 
  const groupVariantsByAttributes = (variants) => {
    // Standard sizes in order from smallest to largest
    const sizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
    
    // Group by size first
    const sizeGroups = {};
    const colorGroups = {};
    let totalQuantity = 0;
    let hasSizeOrColor = false;
    
    // Process size variants
    variants.forEach(variant => {
      // Keep track of total inventory regardless of attributes
      totalQuantity += variant.quantity;
      
      if (variant.size) {
        hasSizeOrColor = true;
        // For sizes, check if it's a standard size or a specialized size (like "XS (Kids)")
        let key = variant.size;
        if (key.includes('(')) {
          // For specialized sizes like "XS (Kids)", use a special format
          key = variant.size.split('(')[0].trim();
          const specialType = variant.size.match(/\((.*)\)/)[1];
          if (!sizeGroups[key]) {
            sizeGroups[key] = {
              special: {},
              quantity: 0
            };
          }
          if (!sizeGroups[key].special[specialType]) {
            sizeGroups[key].special[specialType] = 0;
          }
          sizeGroups[key].special[specialType] += variant.quantity;
        } else {
          // For standard sizes
          if (!sizeGroups[key]) {
            sizeGroups[key] = {
              quantity: 0,
              special: {}
            };
          }
          sizeGroups[key].quantity += variant.quantity;
        }
      }
      
      // Process color variants
      if (variant.color) {
        hasSizeOrColor = true;
        if (!colorGroups[variant.color]) {
          colorGroups[variant.color] = 0;
        }
        colorGroups[variant.color] += variant.quantity;
      }
    });
    
    // Sort sizes according to standard order
    const sortedSizes = Object.keys(sizeGroups).sort((a, b) => {
      const indexA = sizeOrder.indexOf(a);
      const indexB = sizeOrder.indexOf(b);
      
      // If both sizes are in our order list, use that order
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB;
      }
      // If only one is in the order list, prioritize it
      if (indexA !== -1) return -1;
      if (indexB !== -1) return 1;
      
      // Otherwise, alphabetical
      return a.localeCompare(b);
    });
    
    // If no size or color attributes, create a single "Qty" entry
    if (!hasSizeOrColor && variants.length > 0) {
      return {
        sizes: [{ size: "Qty", quantity: totalQuantity, special: {} }],
        colors: []
      };
    }
    
    return {
      sizes: sortedSizes.map(size => ({ 
        size, 
        ...sizeGroups[size] 
      })),
      colors: Object.entries(colorGroups).map(([color, quantity]) => ({ 
        color, 
        quantity 
      }))
    };
  };

  useEffect(() => {
    // Save threshold values to localStorage whenever they change
    localStorage.setItem('lowStockThreshold', lowStockThreshold.toString());
    localStorage.setItem('mediumStockThreshold', mediumStockThreshold.toString());
  }, [lowStockThreshold, mediumStockThreshold]);

  return (
    <Page title="Inventory Collection View">
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="4">
              <LegacyStack vertical>
                <LegacyStack alignment="space-between">
                  <Text variant="headingMd">Filter Products</Text>
                  <Button
                    onClick={() => setShowThresholds(!showThresholds)}
                    plain
                  >
                    Inventory Thresholds
                  </Button>
                </LegacyStack>
                
                {showThresholds && (
                  <LegacyStack vertical spacing="4">
                    <Text variant="headingMd">Inventory Level Thresholds</Text>
                    
                    <Box paddingBlockStart="4" paddingBlockEnd="4">
                      <Text>Low Stock Threshold (Red)</Text>
                      <RangeSlider
                        label="Low Stock Threshold (Red)"
                        value={lowStockThreshold}
                        onChange={setLowStockThreshold}
                        min={0}
                        max={20}
                        output
                        labelHidden
                      />
                    </Box>
                    
                    <Box paddingBlockStart="4" paddingBlockEnd="4">
                      <Text>Medium Stock Threshold (Yellow)</Text>
                      <RangeSlider
                        label="Medium Stock Threshold (Yellow)"
                        value={mediumStockThreshold}
                        onChange={setMediumStockThreshold}
                        min={5}
                        max={50}
                        output
                        labelHidden
                      />
                    </Box>
                    
                    <LegacyStack spacing="3">
                      <div style={getLowStockStyle}>
                        Low: 0-{lowStockThreshold-1} items
                      </div>
                      <div style={getMediumStockStyle}>
                        Medium: {lowStockThreshold}-{mediumStockThreshold-1} items
                      </div>
                      <div style={getHighStockStyle}>
                        High: {mediumStockThreshold}+ items
                      </div>
                    </LegacyStack>
                  </LegacyStack>
                )}
                
                <LegacyStack wrap>
                  <Select
                    label="Status"
                    options={statusOptions}
                    onChange={setSelectedStatus}
                    value={selectedStatus}
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
                    label="Vendor"
                    options={[
                      { label: "All Vendors", value: "" },
                      ...vendors.map((vendor) => ({ label: vendor, value: vendor })),
                    ]}
                    onChange={setSelectedVendor}
                    value={selectedVendor}
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
                      
                      <div style={{ 
                        display: 'grid', 
                        gridTemplateColumns: 'repeat(4, 65px)', 
                        gap: '5px',
                        justifyContent: 'center',
                        margin: '0 auto',
                        rowGap: '5px'
                      }}>
                        {groupVariantsByAttributes(product.variants).sizes.map(({ size, quantity, special }, index) => {
                          const hasSpecial = Object.keys(special).length > 0;
                          const tagStyles = getTagStyles(quantity);
                          
                          return (
                            <div key={size} style={{ 
                              width: '65px', 
                              padding: '0', 
                              margin: '0',
                              boxSizing: 'border-box'
                            }}>
                              <div style={tagStyles}>
                                <span><strong>{size}</strong>: {quantity}</span>
                              </div>
                              
                              {hasSpecial && Object.entries(special).map(([specialType, specialQuantity], specIndex) => (
                                <div 
                                  key={`${size}${specialType}`} 
                                  style={{...getTagStyles(specialQuantity), marginTop: '5px'}}
                                >
                                  <span><strong>{size}</strong>: {specialQuantity}</span>
                                </div>
                              ))}
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