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
  await authenticate.admin(request);
  
  return json({
    planningItems: [
      { id: 1, title: "Summer Collection Planning", description: "Based on previous year's data, consider increasing stock levels for swimwear and lightweight items by 20%." },
      { id: 2, title: "Restocking Recommendation", description: "Several high-selling items are running low. Consider restocking these in the next 2 weeks." },
      { id: 3, title: "Seasonal Transition", description: "Start planning for fall inventory. Historical data suggests beginning the transition in early August." },
    ]
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
  const { planningItems } = useLoaderData();
  
  const styles = {
    container: {
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
    header: {
      fontSize: '24px',
      fontWeight: 'bold',
      marginBottom: '20px',
      color: '#212B36',
    },
    card: {
      backgroundColor: 'white',
      borderRadius: '8px',
      boxShadow: '0 0 0 1px rgba(63, 63, 68, 0.05), 0 1px 3px 0 rgba(63, 63, 68, 0.15)',
      padding: '16px',
      marginBottom: '16px',
    },
    itemTitle: {
      fontSize: '18px',
      fontWeight: 'bold',
      marginBottom: '8px',
      color: '#212B36',
    },
    itemDescription: {
      fontSize: '14px',
      color: '#637381',
      lineHeight: '1.5',
    }
  };
  
  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Inventory Planning</h1>
      
      {planningItems.map(item => (
        <div key={item.id} style={styles.card}>
          <h2 style={styles.itemTitle}>{item.title}</h2>
          <p style={styles.itemDescription}>{item.description}</p>
        </div>
      ))}
    </div>
  );
} 