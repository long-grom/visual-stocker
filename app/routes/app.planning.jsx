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
  Select,
  Button,
  Badge,
  DatePicker,
  Popover,
  TextField,
  RangeSlider,
  InlineStack,
  BlockStack,
  Grid,
  Checkbox,
  Tag
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { useCallback, useEffect, useState } from "react";

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

// Helper function to determine inventory badge status
const getInventoryStatus = (quantity, lowThreshold = 5, mediumThreshold = 15) => {
  if (quantity <= lowThreshold) {
    return "critical";
  } else if (quantity <= mediumThreshold) {
    return "warning";
  } else {
    return "success";
  }
};

// Helper for formatting dates
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

export default function InventoryPlanning() {
  const { products, locations } = useLoaderData();
  
  // Settings state
  const [supplierLeadTime, setSupplierLeadTime] = useState(14);
  const [shippingTime, setShippingTime] = useState(7);
  const [safetyStockDays, setSafetyStockDays] = useState(14);
  const [reorderPoint, setReorderPoint] = useState(5);
  const [lowInventoryThreshold, setLowInventoryThreshold] = useState(5);
  
  // Filter state
  const [selectedVendor, setSelectedVendor] = useState('all');
  const [selectedProductType, setSelectedProductType] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState("ACTIVE");
  
  // Popover state
  const [settingsPopoverActive, setSettingsPopoverActive] = useState(false);
  const toggleSettingsPopover = useCallback(() => setSettingsPopoverActive((active) => !active), []);
  
  // Computed data state
  const [planningData, setPlanningData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  
  // Transform product data for planning
  useEffect(() => {
    // Add today's date and processing dates
    const today = new Date();
    
    // Mock function for sell-through rate (in a real app, this would use historical sales data)
    // Returns a number representing units sold per day
    const calculateSellThrough = (product, size) => {
      // Random number between 0.1 and 1.5 to simulate different sales velocities
      // In a real implementation, this would use actual sales history
      return Math.max(0.1, Math.random() * 1.5).toFixed(1);
    };
    
    // Calculate reorder quantities
    const productsPlanningData = products.map(product => {
      const sizeInventory = {};
      const sizeSellThrough = {};
      let productTotalInventory = 0;
      let needsReorder = false;
      
      // Group by size and calculate inventory
      product.variants.nodes.forEach(variant => {
        const sizeOption = variant.selectedOptions.find(opt => opt.name.toLowerCase() === 'size');
        if (sizeOption) {
          const size = sizeOption.value;
          const qty = variant.inventoryQuantity || 0;
          
          if (!sizeInventory[size]) {
            sizeInventory[size] = 0;
            sizeSellThrough[size] = calculateSellThrough(product, size);
          }
          
          sizeInventory[size] += qty;
          productTotalInventory += qty;
        } else {
          // For products without size variants
          productTotalInventory += (variant.inventoryQuantity || 0);
        }
      });
      
      // Calculate reorder needs for each size
      const sizeReorderNeeds = {};
      const daysUntilOutOfStock = {};
      
      Object.entries(sizeInventory).forEach(([size, qty]) => {
        const dailySales = parseFloat(sizeSellThrough[size]);
        const daysRemaining = dailySales > 0 ? Math.floor(qty / dailySales) : 999;
        
        daysUntilOutOfStock[size] = daysRemaining;
        
        // If stock will run out before we can restock (including lead time and shipping)
        const totalProcessingDays = supplierLeadTime + shippingTime; 
        
        // Calculate if we need to reorder
        if (daysRemaining <= totalProcessingDays + safetyStockDays) {
          // Calculate how many units we need to order
          const idealStockDuration = totalProcessingDays + safetyStockDays + 30; // 30 days additional stock
          const idealStock = Math.ceil(dailySales * idealStockDuration);
          const reorderQuantity = idealStock - qty;
          
          sizeReorderNeeds[size] = {
            currentStock: qty,
            daysRemaining,
            dailySales,
            reorderQuantity: Math.max(0, reorderQuantity),
            urgent: daysRemaining <= totalProcessingDays
          };
          
          if (reorderQuantity > 0) {
            needsReorder = true;
          }
        }
      });
      
      // Calculate reorder date
      const reorderDate = new Date(today);
      // The earliest we need to reorder is based on the most urgent size
      const earliestDaysRemaining = Object.values(daysUntilOutOfStock).length > 0 
        ? Math.min(...Object.values(daysUntilOutOfStock)) 
        : 999;
      
      // We need to place the order with enough time for processing
      const daysUntilReorder = Math.max(0, earliestDaysRemaining - supplierLeadTime - shippingTime - safetyStockDays);
      reorderDate.setDate(reorderDate.getDate() + daysUntilReorder);
      
      // Calculate expected delivery date if ordered today
      const deliveryDate = new Date(today);
      deliveryDate.setDate(deliveryDate.getDate() + supplierLeadTime + shippingTime);
      
      return {
        id: product.id,
        title: product.title,
        type: product.productType,
        vendor: product.vendor,
        status: product.status,
        imageUrl: product.featuredImage?.url,
        imageAlt: product.featuredImage?.altText || product.title,
        totalInventory: productTotalInventory,
        sizeInventory,
        sizeSellThrough,
        sizeReorderNeeds,
        needsReorder,
        reorderDate,
        deliveryDate,
        daysUntilOutOfStock
      };
    });
    
    // Sort products by reorder urgency
    productsPlanningData.sort((a, b) => {
      // First sort by whether they need reordering
      if (a.needsReorder && !b.needsReorder) return -1;
      if (!a.needsReorder && b.needsReorder) return 1;
      
      // Then sort by reorder date
      return a.reorderDate - b.reorderDate;
    });
    
    setPlanningData(productsPlanningData);
  }, [products, supplierLeadTime, shippingTime, safetyStockDays]);
  
  // Filter planning data based on selected filters
  useEffect(() => {
    let filtered = [...planningData];
    
    if (selectedVendor !== 'all') {
      filtered = filtered.filter(product => product.vendor === selectedVendor);
    }
    
    if (selectedProductType !== 'all') {
      filtered = filtered.filter(product => product.type === selectedProductType);
    }
    
    if (selectedStatus) {
      filtered = filtered.filter(product => product.status === selectedStatus);
    }
    
    // Location filtering would be implemented here in a real app
    // This would require querying inventory by location
    
    setFilteredData(filtered);
  }, [planningData, selectedVendor, selectedProductType, selectedLocation, selectedStatus]);
  
  // Extract unique values for filters
  const vendors = ['all', ...new Set(products.map(p => p.vendor).filter(Boolean))];
  const productTypes = ['all', ...new Set(products.map(p => p.productType).filter(Boolean))];
  const locationOptions = ['all', ...locations.map(location => location.name)];
  
  // Status options for the filter
  const statusOptions = [
    { value: "ACTIVE", label: "Active" },
    { value: "ARCHIVED", label: "Archived" },
    { value: "DRAFT", label: "Draft" },
    { value: "", label: "All Products" }
  ];
  
  // Get vendor and product type select options
  const vendorOptions = vendors.map(vendor => ({
    label: vendor === 'all' ? 'All Vendors' : vendor,
    value: vendor
  }));
  
  const productTypeOptions = productTypes.map(type => ({
    label: type === 'all' ? 'All Product Types' : type,
    value: type
  }));
  
  const locationSelectOptions = [
    { label: 'All Locations', value: 'all' },
    ...locations.map(location => ({
      label: location.name,
      value: location.id
    }))
  ];
  
  // Settings popover
  const settingsActivator = (
    <Button onClick={toggleSettingsPopover}>
      Planning Settings
    </Button>
  );
  
  // Format date for display
  const today = new Date();
  
  return (
    <Page title="Inventory Planning">
      <Layout>
        <Layout.Section>
          <Banner
            title="Inventory Planning and Reordering"
            status="info"
          >
            <p>Plan your inventory orders based on current stock levels, lead times, and estimated sell-through rates.</p>
          </Banner>
        </Layout.Section>
        
        <Layout.Section>
          <Card>
            <Box padding="4">
              <InlineStack align="space-between">
                <BlockStack gap="4">
                  <Text variant="headingMd">Reordering Timeline</Text>
                  <InlineStack gap="5" wrap={false}>
                    <BlockStack gap="2">
                      <Text>Supplier Lead Time</Text>
                      <Tag size="large">{supplierLeadTime} days</Tag>
                    </BlockStack>
                    <Text>•</Text>
                    <BlockStack gap="2">
                      <Text>Shipping Time</Text>
                      <Tag size="large">{shippingTime} days</Tag>
                    </BlockStack>
                    <Text>•</Text>
                    <BlockStack gap="2">
                      <Text>Safety Stock</Text>
                      <Tag size="large">{safetyStockDays} days</Tag>
                    </BlockStack>
                  </InlineStack>
                </BlockStack>
                
                <Popover
                  active={settingsPopoverActive}
                  activator={settingsActivator}
                  onClose={toggleSettingsPopover}
                  ariaHaspopup={false}
                  sectioned
                >
                  <Box padding="4">
                    <BlockStack gap="4">
                      <Text variant="headingMd">Planning Settings</Text>
                      
                      <RangeSlider
                        label="Supplier Lead Time (days)"
                        value={supplierLeadTime}
                        onChange={setSupplierLeadTime}
                        min={1}
                        max={60}
                        output
                      />
                      
                      <RangeSlider
                        label="Shipping Time (days)"
                        value={shippingTime}
                        onChange={setShippingTime}
                        min={1}
                        max={30}
                        output
                      />
                      
                      <RangeSlider
                        label="Safety Stock (days)"
                        value={safetyStockDays}
                        onChange={setSafetyStockDays}
                        min={0}
                        max={30}
                        output
                      />
                      
                      <RangeSlider
                        label="Low Inventory Threshold (units)"
                        value={lowInventoryThreshold}
                        onChange={setLowInventoryThreshold}
                        min={1}
                        max={20}
                        output
                      />
                    </BlockStack>
                  </Box>
                </Popover>
              </InlineStack>
            </Box>
          </Card>
        </Layout.Section>
        
        <Layout.Section>
          <Card>
            <Box padding="4">
              <BlockStack gap="5">
                <InlineStack align="space-between">
                  <Text variant="headingMd">Filter Products</Text>
                </InlineStack>
                
                <LegacyStack wrap>
                  <Select
                    label="Status"
                    options={statusOptions}
                    value={selectedStatus}
                    onChange={setSelectedStatus}
                  />
                  <Select
                    label="Vendor"
                    options={vendorOptions}
                    value={selectedVendor}
                    onChange={setSelectedVendor}
                  />
                  <Select
                    label="Product Type"
                    options={productTypeOptions}
                    value={selectedProductType}
                    onChange={setSelectedProductType}
                  />
                  <Select
                    label="Location"
                    options={locationSelectOptions}
                    value={selectedLocation}
                    onChange={setSelectedLocation}
                  />
                </LegacyStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
        
        <Layout.Section>
          <Card>
            <Box padding="4">
              <BlockStack gap="5">
                <Text variant="headingLg">Reorder Recommendations</Text>
                
                {filteredData.filter(p => p.needsReorder).length === 0 ? (
                  <Banner status="success" title="No reorders needed at this time">
                    <p>Based on your current settings, no products need to be reordered.</p>
                  </Banner>
                ) : (
                  <>
                    {filteredData.filter(p => p.needsReorder).map((product, index) => {
                      // Get sizes that need reordering
                      const sizesToReorder = Object.entries(product.sizeReorderNeeds)
                        .filter(([_, details]) => details.reorderQuantity > 0)
                        .sort((a, b) => a[1].daysRemaining - b[1].daysRemaining);
                      
                      if (sizesToReorder.length === 0) return null;
                      
                      return (
                        <div key={product.id} style={{ marginBottom: "16px" }}>
                          <Card
                            shadow="lg" 
                            background={index % 2 === 0 ? "bg-surface" : "bg-surface-neutral"}
                          >
                            <Box padding="6">
                              <InlineStack gap="6" align="start">
                                {product.imageUrl && (
                                  <Box width="100px">
                                    <Thumbnail
                                      source={product.imageUrl}
                                      alt={product.imageAlt}
                                      size="large"
                                    />
                                  </Box>
                                )}
                                
                                <BlockStack gap="4" flexible>
                                  <InlineStack align="space-between">
                                    <Text variant="headingMd">{product.title}</Text>
                                  </InlineStack>
                                  
                                  <InlineStack gap="6" wrap={false}>
                                    <Text variant="bodySm">
                                      Current Inventory: {product.totalInventory} units
                                    </Text>
                                  </InlineStack>
                                  
                                  <Divider />
                                  
                                  <BlockStack gap="4">
                                    <Text variant="headingSm">
                                      Recommended Order:
                                    </Text>
                                    
                                    <BlockStack gap="10">
                                      {sizesToReorder.map(([size, details]) => (
                                        <Box 
                                          key={size} 
                                          padding="4" 
                                          background="bg-surface" 
                                          borderRadius="2"
                                          shadow="md"
                                          border="base"
                                        >
                                          <BlockStack gap="3">
                                            <InlineStack align="space-between">
                                              <InlineStack gap="4">
                                                <Badge 
                                                  status="warning"
                                                  size="large"
                                                >
                                                  Size {size}
                                                </Badge>
                                                
                                                <Text>
                                                  Current stock: {details.currentStock} units 
                                                  ({details.daysRemaining} days remaining)
                                                </Text>
                                              </InlineStack>
                                              
                                              <Text fontWeight="bold" variant="headingSm">
                                                Order {details.reorderQuantity} units
                                              </Text>
                                            </InlineStack>
                                          </BlockStack>
                                        </Box>
                                      ))}
                                    </BlockStack>
                                  </BlockStack>
                                  
                                  <Box paddingBlockStart="5" paddingBlockEnd="4">
                                    <Divider />
                                  </Box>
                                  
                                  <Box paddingBlockStart="2" paddingBlockEnd="2">
                                    <BlockStack gap="5">
                                      <Text variant="headingSm">Delivery Timeline</Text>
                                      <BlockStack gap="4">
                                        <Box background="bg-surface" padding="3" borderRadius="2" shadow="sm">
                                          <BlockStack gap="2">
                                            <Text variant="bodySm" fontWeight="semibold">Estimated Delivery Date (if ordered today):</Text>
                                            <Text fontWeight="bold" variant="bodyMd">
                                              {formatDate(product.deliveryDate)}
                                            </Text>
                                          </BlockStack>
                                        </Box>
                                      </BlockStack>
                                    </BlockStack>
                                  </Box>
                                </BlockStack>
                              </InlineStack>
                            </Box>
                          </Card>
                        </div>
                      );
                    })}
                  </>
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 