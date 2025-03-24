import { json } from "@remix-run/node";
import { useLoaderData, Form, useSubmit } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import { useState, useEffect } from "react";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  
  // Get filter values from URL params
  const productType = url.searchParams.get("productType") || "";
  const vendor = url.searchParams.get("vendor") || "";
  const status = url.searchParams.get("status") || "ACTIVE";
  const sort = url.searchParams.get("sort") || "title";
  const searchTerm = url.searchParams.get("searchTerm") || "";
  const location = url.searchParams.get("location") || "";
  
  // Debug mode
  const debug = url.searchParams.get("debug") === "true";
  
  try {
    // Add search term to query if provided
    let searchQuery = searchTerm ? `query: "${searchTerm}"` : "";
    
    // Special case for Nagnata - ensure we search for Nagnata products specifically
    if (vendor === "Nagnata" || searchTerm?.toLowerCase().includes("nagnata")) {
      searchQuery = `query: "nagnata"`;
    }
    
    // Split the queries to stay under the 1000 cost limit
    // Query 1: Get products with minimal fields first
    const productsResponse = await admin.graphql(`
      query {
        products(first: 50, ${searchQuery}) {
          nodes {
            id
            title
            productType
            vendor
            status
            tags
            handle
            isGiftCard
            hasOnlyDefaultVariant
            featuredImage {
              url
              altText
            }
          }
        }
      }
    `);
    
    const productsData = await productsResponse.json();
    
    if (productsData.errors) {
      console.error("GraphQL errors in products query:", productsData.errors);
      throw new Error(productsData.errors[0]?.message || "GraphQL errors occurred");
    }
    
    // Get the list of product IDs for detailed fetching
    const productIDs = productsData.data.products.nodes.map(p => p.id);
    
    // Query 2: Get detailed product information for the filtered products
    const productDetailsPromises = [];
    // Process in batches of 10 to stay under limits
    for (let i = 0; i < productIDs.length; i += 10) {
      const batchIDs = productIDs.slice(i, i + 10);
      
      const detailsPromise = admin.graphql(`
        query {
          nodes(ids: ${JSON.stringify(batchIDs)}) {
            ... on Product {
              id
              metafields(first: 5, namespace: "custom") {
                nodes {
                  key
                  value
                  namespace
                }
              }
              variants(first: 10) {
                nodes {
                  id
                  title
                  displayName
                  inventoryQuantity
                  inventoryPolicy
                  sku
                  metafields(first: 5, namespace: "custom") {
                    nodes {
                      key
                      value
                      namespace
                    }
                  }
                  inventoryItem {
                    id
                    tracked
                    requiresShipping
                    inventoryHistoryUrl
                    inventoryLevels(first: 5) {
                      edges {
                        node {
                          id
                          quantities(names: ["available", "on_hand", "committed"]) {
                            name
                            quantity
                          }
                          location {
                            id
                            name
                            isActive
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      `).then(res => res.json());
      
      productDetailsPromises.push(detailsPromise);
    }
    
    // Query 3: Get metadata in separate queries
    const [productTypesResponse, vendorsResponse, locationsResponse] = await Promise.all([
      admin.graphql(`
        query {
          productTypes: products(first: 100) {
            nodes {
              productType
            }
          }
        }
      `).then(res => res.json()),
      
      admin.graphql(`
        query {
          vendors: products(first: 100) {
            nodes {
              vendor
            }
          }
        }
      `).then(res => res.json()),
      
      admin.graphql(`
        query {
          locations(first: 10) {
            nodes {
              id
              name
              isActive
            }
          }
        }
      `).then(res => res.json())
    ]);
    
    // Wait for all detailed product queries to complete
    const productDetailsResults = await Promise.all(productDetailsPromises);
    
    // Merge the basic product data with detailed product data
    const productMap = {};
    productsData.data.products.nodes.forEach(product => {
      productMap[product.id] = { ...product, variants: { nodes: [] } };
    });
    
    // Add detailed data to products
    productDetailsResults.forEach(result => {
      if (result.data?.nodes) {
        result.data.nodes.forEach(node => {
          if (node && productMap[node.id]) {
            // Merge the detailed data with the basic product data
            productMap[node.id] = {
              ...productMap[node.id],
              metafields: node.metafields,
              variants: node.variants
            };
          }
        });
      }
    });
    
    // Convert the product map back to an array
    const products = Object.values(productMap);
    
    // Process the metadata
    const productTypes = productTypesResponse.data?.productTypes?.nodes || [];
    const vendors = vendorsResponse.data?.vendors?.nodes || [];
    const locations = locationsResponse.data?.locations?.nodes || [];
    
    // Output debug information
    if (debug) {
      console.log("Product count:", products.length);
      
      // Enhanced inventory debug info
      const inventorySummary = [];
      products.forEach(product => {
        const variants = product.variants?.nodes || [];
        variants.forEach(variant => {
          const inventoryLevels = variant.inventoryItem?.inventoryLevels?.edges || [];
          // Check for CIN7 inventory in metafields
          const cin7Stock = variant.metafields?.nodes?.find(m => m.key === "cin7_stock")?.value;
          
          inventorySummary.push({
            productTitle: product.title,
            productId: product.id,
            variantTitle: variant.title,
            variantId: variant.id,
            sku: variant.sku,
            inventorySystem: isCIN7Product(product) ? "CIN7" : "Shopify",
            inventoryQuantity: variant.inventoryQuantity,
            cin7Stock: cin7Stock || "N/A",
            inventoryPolicy: variant.inventoryPolicy,
            tracked: variant.inventoryItem?.tracked,
            inventoryLevels: inventoryLevels.map(edge => {
              const levels = edge.node.quantities?.map(q => `${q.name}: ${q.quantity}`).join(', ') || 'No quantities';
              return {
                locationName: edge.node.location?.name || 'Unknown location',
                quantities: levels
              };
            })
          });
        });
      });
      console.log("Inventory Summary:", inventorySummary);
      
      // Log vendor and product type info
      console.log("Vendors:", [...new Set(vendors.map(v => v.vendor).filter(Boolean))]);
      console.log("Product Types:", [...new Set(productTypes.map(t => t.productType).filter(Boolean))]);
    } else {
      console.log("Products summary:", {
        productCount: products.length,
        vendorCount: [...new Set(vendors.map(v => v.vendor).filter(Boolean))].length,
        productTypeCount: [...new Set(productTypes.map(t => t.productType).filter(Boolean))].length
      });

      // Log specific search for Nagnata products
      const nagnataProducts = products.filter(p => 
        p.vendor?.toLowerCase().includes('nagnata') || 
        p.title?.toLowerCase().includes('nagnata')
      );
      if (nagnataProducts?.length) {
        console.log("Nagnata products found:", nagnataProducts.length);
        console.log("First Nagnata product:", nagnataProducts[0]);
      } else {
        console.log("No Nagnata products found in results");
      }
    }
    
    // Debug logging for vendor names
    if (debug || vendor === "Nagnata" || searchTerm?.toLowerCase().includes("nagnata")) {
      console.log("Debug - All vendor names:", vendors.map(p => p.vendor).filter(Boolean));
      
      // Check for anything containing "nagnata" in vendor or title
      const nagnataRelated = products.filter(p => 
        p.vendor?.toLowerCase().includes("nagnata") || 
        p.title?.toLowerCase().includes("nagnata")
      );
      
      console.log("Nagnata-related products found:", nagnataRelated.length);
      if (nagnataRelated.length > 0) {
        nagnataRelated.forEach((p, idx) => {
          console.log(`Nagnata product ${idx + 1}:`, {
            title: p.title,
            vendor: p.vendor,
            id: p.id,
            variants: p.variants?.nodes?.length || 0
          });
        });
      }
    }
    
    // Extract unique product types and vendors for filters
    const uniqueProductTypes = [...new Set(productTypes.map(p => p.productType).filter(Boolean))];
    
    // Process vendor names to handle variations
    let vendorMap = new Map();
    vendors.forEach(p => {
      if (!p.vendor) return;
      
      const vendorName = p.vendor.trim();
      // Special case for Nagnata - any vendor containing "nagnata" will be mapped to "Nagnata"
      if (vendorName.toLowerCase().includes("nagnata")) {
        vendorMap.set("Nagnata", true);
      } else {
        vendorMap.set(vendorName, true);
      }
    });
    const uniqueVendors = [...vendorMap.keys()].sort();

    // Apply filters client-side
    let filteredProducts = products;
    
    // Filter by search term if not already applied in GraphQL
    if (searchTerm && !searchQuery) {
      const term = searchTerm.toLowerCase();
      filteredProducts = filteredProducts.filter(p => 
        p.title?.toLowerCase().includes(term) || 
        p.vendor?.toLowerCase().includes(term) || 
        p.productType?.toLowerCase().includes(term)
      );
    }
    
    if (productType) {
      filteredProducts = filteredProducts.filter(p => p.productType === productType);
    }
    
    if (vendor) {
      // Special case for Nagnata - include products with Nagnata in title too
      if (vendor.toLowerCase() === "nagnata") {
        filteredProducts = filteredProducts.filter(p => 
          p.vendor?.toLowerCase().includes(vendor.toLowerCase()) ||
          p.title?.toLowerCase().includes(vendor.toLowerCase()) ||
          p.tags?.some(tag => tag.toLowerCase().includes(vendor.toLowerCase())) ||
          isCIN7Product(p)
        );
      } else {
        // Normal vendor filtering for other vendors
        filteredProducts = filteredProducts.filter(p => 
          p.vendor?.toLowerCase().includes(vendor.toLowerCase())
        );
      }
    }
    
    if (status) {
      // Filter by Shopify product status
      filteredProducts = filteredProducts.filter(p => p.status === status);
    }
    
    // Apply sorting
    filteredProducts.sort((a, b) => {
      if (sort === "title") {
        return a.title.localeCompare(b.title);
      } else if (sort === "inventory-low") {
        const aTotal = (a.variants?.nodes || []).reduce((sum, v) => sum + (getEffectiveInventory(a, v) || 0), 0);
        const bTotal = (b.variants?.nodes || []).reduce((sum, v) => sum + (getEffectiveInventory(b, v) || 0), 0);
        return aTotal - bTotal;
      } else if (sort === "inventory-high") {
        const aTotal = (a.variants?.nodes || []).reduce((sum, v) => sum + (getEffectiveInventory(a, v) || 0), 0);
        const bTotal = (b.variants?.nodes || []).reduce((sum, v) => sum + (getEffectiveInventory(b, v) || 0), 0);
        return bTotal - aTotal;
      }
      return 0;
    });
    
    return json({
      products: filteredProducts,
      locations: locations,
      productTypes: uniqueProductTypes,
      vendors: uniqueVendors,
      rawData: debug ? { products: { nodes: products }, locations: { nodes: locations } } : null,
      filters: { productType, vendor, status, sort, searchTerm, location },
      error: null
    });
  } catch (error) {
    console.error('GraphQL Error:', error);
    return json({
      products: [],
      locations: [],
      productTypes: [],
      vendors: [],
      rawData: null,
      filters: { productType, vendor, status, sort, searchTerm, location },
      error: error.message || 'Failed to load inventory data'
    });
  }
};

// Helper function to determine if a product is managed by CIN7
function isCIN7Product(product) {
  // Check vendor - Nagnata is managed by CIN7
  if (product.vendor?.toLowerCase().includes('nagnata')) {
    return true;
  }
  
  // Check title - Some Nagnata products might have Nagnata in title but not vendor
  if (product.title?.toLowerCase().includes('nagnata')) {
    return true;
  }
  
  // Check tags for CIN7 identifier
  if (product.tags?.some(tag => 
    tag.toLowerCase().includes('cin7') || 
    tag.toLowerCase().includes('nagnata')
  )) {
    return true;
  }
  
  // Check metafields for CIN7 identifiers
  if (product.metafields?.nodes?.some(m => 
    m.key?.toLowerCase().includes('cin7') || 
    m.value?.toLowerCase?.()?.includes('nagnata')
  )) {
    return true;
  }
  
  return false;
}

// Get effective inventory based on the product's inventory system
function getEffectiveInventory(product, variant) {
  // Check if product is managed by CIN7
  if (isCIN7Product(product)) {
    // Try to find CIN7 stock in variant metafields
    const cin7StockMeta = variant.metafields?.nodes?.find(m => m.key === 'cin7_stock');
    if (cin7StockMeta) {
      return parseInt(cin7StockMeta.value, 10) || 0;
    }
    
    // If no CIN7 metafield is found, we might be using a combination of data
    // First, check for available inventory from Shopify API
    const availableQty = variant.inventoryItem?.inventoryLevels?.edges?.[0]?.node?.quantities?.find(q => q.name === 'available')?.quantity;
    if (availableQty !== undefined) {
      return availableQty;
    }
  }
  
  // Default to Shopify's inventoryQuantity if not CIN7 or no CIN7 data found
  return variant.inventoryQuantity;
}

export default function InventoryVisualization() {
  console.log("Component rendering started");
  const { products = [], locations = [], productTypes = [], vendors = [], filters, rawData, error } = useLoaderData();
  const submit = useSubmit();
  
  // Debug logging to see what's coming from the loader
  console.log("Products data loaded:", { 
    productCount: products?.length || 0,
    locationsCount: locations?.length || 0,
    firstProduct: products?.[0] ? { 
      id: products[0].id,
      title: products[0].title,
      variantCount: products[0].variants?.nodes?.length || 0,
      selectedLocation: filters.location,
      locations: locations.map(l => ({ id: l.id, name: l.name }))
    } : 'No products'
  });
  
  // Add state for debug section visibility
  const [showDebug, setShowDebug] = useState({});
  
  // Toggle debug section for a specific product
  const toggleDebug = (productId) => {
    setShowDebug(prev => ({
      ...prev,
      [productId]: !prev[productId]
    }));
  };
  
  const styles = {
    container: {
      padding: '20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      color: '#202223',
      backgroundColor: '#F6F6F7',
      minHeight: '100vh',
    },
    header: {
      fontSize: '28px',
      fontWeight: '600',
      marginBottom: '24px',
      color: '#202223',
    },
    filtersCard: {
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15)',
      padding: '20px',
      marginBottom: '24px',
    },
    filtersHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '24px',
    },
    filterLabel: {
      fontSize: '18px',
      fontWeight: '600',
    },
    tabsContainer: {
      display: 'flex',
      gap: '10px',
      marginBottom: '20px',
    },
    tab: {
      padding: '8px 16px',
      borderRadius: '4px',
      fontSize: '14px',
      cursor: 'pointer',
      backgroundColor: '#F4F6F8',
      color: '#202223',
      border: '1px solid #DFE3E8',
    },
    activeTab: {
      backgroundColor: '#5C6AC4',
      color: 'white',
      border: '1px solid #5C6AC4',
    },
    filterRow: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '16px',
      marginBottom: '16px',
    },
    filterGroup: {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      flex: '1',
      minWidth: '180px',
    },
    filterGroupLabel: {
      fontSize: '14px',
      fontWeight: '500',
      color: '#637381',
    },
    dropdown: {
      position: 'relative',
    },
    select: {
      width: '100%',
      padding: '10px 14px',
      borderRadius: '4px',
      border: '1px solid #C4CDD5',
      fontSize: '14px',
      appearance: 'none',
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23637381' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E%0A")`,
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'right 14px center',
      backgroundColor: 'white',
    },
    gridContainer: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(370px, 1fr))',
      gap: '24px',
    },
    productCard: {
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    },
    productContent: {
      padding: '16px',
    },
    productImage: {
      width: '90px',
      height: '90px',
      objectFit: 'cover',
      borderRadius: '4px',
      float: 'left',
      marginRight: '16px',
      marginBottom: '8px',
    },
    productTitle: {
      fontSize: '16px',
      fontWeight: '600',
      marginBottom: '8px',
      color: '#202223',
    },
    vendorName: {
      fontSize: '14px',
      color: '#637381',
      marginBottom: '12px',
      fontWeight: '500',
    },
    productMeta: {
      display: 'flex',
      gap: '8px',
      marginBottom: '16px',
    },
    productMetaTag: {
      display: 'inline-block',
      padding: '4px 8px',
      backgroundColor: '#F4F6F8',
      borderRadius: '4px',
      fontSize: '12px',
      color: '#637381',
    },
    totalQuantity: {
      display: 'flex',
      alignItems: 'center',
      marginBottom: '12px',
      fontSize: '14px',
      color: '#637381',
    },
    totalQuantityValue: {
      fontSize: '16px',
      fontWeight: '600',
      marginLeft: '4px',
      color: '#202223',
    },
    totalBadge: {
      display: 'inline-block',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '14px',
      fontWeight: '500',
      marginLeft: 'auto',
    },
    inventoryGrid: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      clear: 'both',
      marginTop: '8px',
    },
    sizePill: {
      padding: '6px 12px',
      borderRadius: '4px',
      fontSize: '13px',
      fontWeight: '500',
      minWidth: '45px',
      width: 'auto',
      textAlign: 'center',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '8px',
      margin: '2px',
    },
    variantName: {
      fontWeight: '500',
      fontSize: '13px',
    },
    quantity: {
      fontSize: '13px',
    },
    outOfStock: {
      backgroundColor: '#FFF4F4',
      color: '#D72C0D',
    },
    lowStock: {
      backgroundColor: '#FFF4E5',
      color: '#B98900',
    },
    inStock: {
      backgroundColor: '#E3F1DF',
      color: '#108043',
    },
    emptyState: {
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15)',
      padding: '24px',
      textAlign: 'center',
    },
    emptyStateIcon: {
      width: '64px',
      height: '64px',
      margin: '0 auto 16px',
      color: '#8C9196',
    },
    emptyStateTitle: {
      fontSize: '16px',
      fontWeight: '600',
      marginBottom: '8px',
      color: '#202223',
    },
    emptyStateText: {
      fontSize: '14px',
      color: '#637381',
      maxWidth: '400px',
      margin: '0 auto',
    },
    debugToggle: {
      display: 'inline-flex',
      alignItems: 'center',
      padding: '6px 12px',
      backgroundColor: '#f5f5f5',
      border: '1px solid #e0e0e0',
      borderRadius: '4px',
      fontSize: '12px',
      color: '#637381',
      cursor: 'pointer',
      marginTop: '12px',
      marginBottom: '8px',
    },
    debugSection: {
      marginTop: '20px',
      padding: '10px',
      backgroundColor: '#f5f5f5',
      fontSize: '12px',
      borderRadius: '4px',
    },
    chevron: {
      display: 'inline-block',
      marginLeft: '6px',
      transition: 'transform 0.2s ease',
    },
  };
  
  // Group variants by their full titles
  function getVariantMap(variants, selectedLocationId) {
    const variantMap = {};
    
    if (!variants || !Array.isArray(variants)) {
      return variantMap;
    }
    
    variants.forEach(variant => {
      if (!variant) return;
      
      // Use the variant title
      const variantName = variant.title || 'Default';
      
      // Calculate total available quantity from inventory levels
      let totalAvailable = 0;
      const inventoryLevels = variant.inventoryItem?.inventoryLevels?.edges || [];
      
      if (inventoryLevels.length > 0) {
        // If a location is selected, only count quantities for that location
        if (selectedLocationId) {
          const locationLevel = inventoryLevels.find(edge => 
            edge.node.location?.id === selectedLocationId
          );
          if (locationLevel) {
            const availableQty = locationLevel.node.quantities?.find(q => q.name === 'available')?.quantity || 0;
            totalAvailable = availableQty;
          }
        } else {
          // Sum up all 'available' quantities across all locations
          inventoryLevels.forEach(edge => {
            const availableQty = edge.node.quantities?.find(q => q.name === 'available')?.quantity || 0;
            totalAvailable += availableQty;
          });
        }
      } else {
        // Fallback to inventoryQuantity if no inventory levels
        totalAvailable = variant.inventoryQuantity || 0;
      }
      
      // Store variant info
      variantMap[variantName] = {
        quantity: totalAvailable,
        id: variant.id
      };
    });
    
    return variantMap;
  }
  
  // Get color style for size pill based on quantity
  function getSizePillStyle(quantity) {
    if (quantity === undefined || quantity === null || quantity <= 0) {
      return { ...styles.sizePill, ...styles.outOfStock };
    } else if (quantity < 5) {
      return { ...styles.sizePill, ...styles.lowStock };
    } else {
      return { ...styles.sizePill, ...styles.inStock };
    }
  }
  
  // Get color style for total quantity badge
  function getTotalQuantityStyle(quantity) {
    if (quantity <= 0) {
      return { ...styles.totalBadge, backgroundColor: '#FFF4F4', color: '#D72C0D' };
    } else if (quantity < 10) {
      return { ...styles.totalBadge, backgroundColor: '#FFF4E5', color: '#B98900' };
    } else {
      return { ...styles.totalBadge, backgroundColor: '#E3F1DF', color: '#108043' };
    }
  }
  
  // Calculate total available quantity for a product
  function getTotalAvailableQuantity(variants, selectedLocationId) {
    if (!variants || !Array.isArray(variants)) {
      return 0;
    }
    
    return variants.reduce((total, variant) => {
      if (!variant) return total;
      
      // Calculate total available quantity from inventory levels
      let variantTotal = 0;
      const inventoryLevels = variant.inventoryItem?.inventoryLevels?.edges || [];
      
      if (inventoryLevels.length > 0) {
        // If a location is selected, only count quantities for that location
        if (selectedLocationId) {
          const locationLevel = inventoryLevels.find(edge => 
            edge.node.location?.id === selectedLocationId
          );
          if (locationLevel) {
            const availableQty = locationLevel.node.quantities?.find(q => q.name === 'available')?.quantity || 0;
            variantTotal = availableQty;
          }
        } else {
          // Sum up all 'available' quantities across all locations
          inventoryLevels.forEach(edge => {
            const availableQty = edge.node.quantities?.find(q => q.name === 'available')?.quantity || 0;
            variantTotal += availableQty;
          });
        }
      } else {
        // Fallback to inventoryQuantity if no inventory levels
        variantTotal = variant.inventoryQuantity || 0;
      }
      
      return total + variantTotal;
    }, 0);
  }
  
  function handleFilterChange(event) {
    const form = event.currentTarget.form;
    submit(form, { replace: true });
  }
  
  function resetFilters() {
    const formData = new FormData();
    submit(formData, { method: "get", replace: true });
  }
  
  // Debug flag for first few products only
  const [debugFirstFewProducts, setDebugFirstFewProducts] = useState(true);
  
  // After rendering products, disable detailed debug output
  useEffect(() => {
    if (debugFirstFewProducts) {
      // Limit to first 3 products to avoid overwhelming the console
      const firstFewProducts = products.slice(0, 3);
      console.log("INVENTORY DEBUG - First few products:", firstFewProducts.map(product => ({
        title: product.title,
        id: product.id,
        selectedLocation: filters.location,
        variants: product.variants?.nodes?.map(variant => ({
          title: variant.title,
          id: variant.id,
          tracked: variant.inventoryItem?.tracked,
          inventoryLevels: variant.inventoryItem?.inventoryLevels?.edges?.map(edge => ({
            location: edge.node.location?.name,
            locationId: edge.node.location?.id,
            quantities: edge.node.quantities
          })) || []
        })) || []
      })));
      
      setDebugFirstFewProducts(false);
    }
  }, [products, debugFirstFewProducts, filters.location]);
  
  // Display error state if there's an error
  if (error) {
    return (
      <div style={styles.container}>
        <h1 style={styles.header}>Inventory Collection View</h1>
        <div style={styles.emptyState}>
          <div style={styles.emptyStateTitle}>Error loading inventory data</div>
          <div style={styles.emptyStateText}>{error}</div>
        </div>
      </div>
    );
  }
  
  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Inventory Collection View</h1>
      
      <div style={styles.filtersCard}>
        <Form method="get">
          <div style={styles.filtersHeader}>
            <div style={styles.filterLabel}>Filter Products</div>
            
            <div style={styles.tabsContainer}>
              <div style={styles.tab}>Inventory Thresholds</div>
            </div>
          </div>
          
          <div style={styles.filterRow}>
            <div style={styles.filterGroup}>
              <div style={styles.filterGroupLabel}>Status</div>
              <div style={styles.dropdown}>
                <select 
                  style={styles.select}
                  name="status" 
                  value={filters.status || "ACTIVE"}
                  onChange={handleFilterChange}
                >
                  <option value="">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
            </div>
            
            <div style={styles.filterGroup}>
              <div style={styles.filterGroupLabel}>Product Type</div>
              <div style={styles.dropdown}>
                <select 
                  style={styles.select}
                  name="productType" 
                  value={filters.productType || ""}
                  onChange={handleFilterChange}
                >
                  <option value="">All Types</option>
                  {productTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div style={styles.filterGroup}>
              <div style={styles.filterGroupLabel}>Vendor</div>
              <div style={styles.dropdown}>
                <select 
                  style={styles.select}
                  name="vendor" 
                  value={filters.vendor || ""}
                  onChange={handleFilterChange}
                >
                  <option value="">All Vendors</option>
                  {vendors.map(vendor => (
                    <option key={vendor} value={vendor}>{vendor}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div style={styles.filterGroup}>
              <div style={styles.filterGroupLabel}>Warehouse Location</div>
              <div style={styles.dropdown}>
                <select 
                  style={styles.select}
                  name="location" 
                  value={filters.location || ""}
                  onChange={handleFilterChange}
                >
                  <option value="">All Locations</option>
                  {locations.map(location => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </Form>
      </div>
      
      {products.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyStateTitle}>No products found</div>
          <div style={styles.emptyStateText}>
            Try adjusting your filters or search for different products.
          </div>
        </div>
      ) : (
        <div style={styles.gridContainer}>
          {products.map(product => {
            if (!product) return null;
            
            // Get variants grouped by their full titles
            const variantMap = getVariantMap(product.variants?.nodes || [], filters.location);
            
            return (
              <div key={product.id} style={styles.productCard}>
                <div style={styles.productContent}>
                  {product.featuredImage?.url && (
                    <img 
                      src={product.featuredImage.url} 
                      alt={product.title} 
                      style={styles.productImage}
                    />
                  )}
                  
                  <h3 style={styles.productTitle}>{product.title}</h3>
                  <div style={styles.vendorName}>{product.vendor || 'No vendor'}</div>
                  
                  <div style={styles.productMeta}>
                    <div style={styles.productMetaTag}>{product.productType || 'No type'}</div>
                  </div>
                  
                  <div style={styles.totalQuantity}>
                    <span>Total Available:</span>
                    <span style={styles.totalQuantityValue}>
                      {getTotalAvailableQuantity(product.variants?.nodes || [], filters.location)}
                    </span>
                  </div>
                  
                  <div style={styles.inventoryGrid}>
                    {Object.entries(variantMap).map(([variantName, variantInfo]) => (
                      <div key={variantName} style={getSizePillStyle(variantInfo.quantity)}>
                        <span style={styles.variantName}>{variantName}</span>
                        <span style={styles.quantity}>{variantInfo.quantity}</span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Debug toggle button */}
                  <button
                    type="button"
                    onClick={() => toggleDebug(product.id)}
                    style={styles.debugToggle}
                  >
                    {showDebug[product.id] ? 'Hide' : 'Show'} Debug Info
                    <span 
                      style={{
                        ...styles.chevron,
                        transform: showDebug[product.id] ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    >
                      ▼
                    </span>
                  </button>
                  
                  {/* Collapsible debug section */}
                  {showDebug[product.id] && (
                    <div style={styles.debugSection}>
                      <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                        Debug - All Inventory Levels {filters.location ? `(Filtered by location: ${locations.find(l => l.id === filters.location)?.name})` : '(All locations)'}:
                      </div>
                      {product.variants?.nodes?.map((variant) => (
                        <div key={variant.id} style={{ marginBottom: '12px' }}>
                          <div style={{ fontWeight: '500' }}>Variant: {variant.title}</div>
                          {variant.inventoryItem?.inventoryLevels?.edges
                            ?.filter(edge => !filters.location || edge.node.location?.id === filters.location)
                            ?.map((edge) => (
                            <div key={edge.node.id} style={{ marginLeft: '12px', marginTop: '4px' }}>
                              <div>Location: {edge.node.location?.name}</div>
                              <div style={{ marginLeft: '8px' }}>
                                {edge.node.quantities?.map((q) => (
                                  <span key={q.name} style={{ 
                                    display: 'inline-block',
                                    margin: '2px 4px',
                                    padding: '2px 6px',
                                    backgroundColor: q.name === 'available' ? '#e3f2fd' : '#f5f5f5',
                                    borderRadius: '4px',
                                    border: q.name === 'available' ? '1px solid #90caf9' : '1px solid #e0e0e0'
                                  }}>
                                    {q.name}: {q.quantity}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
} 