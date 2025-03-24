import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  
  return json({
    recommendations: [
      { id: 1, title: "Email Marketing Campaign", description: "Based on your inventory data, we recommend an email campaign for items that are overstocked." },
      { id: 2, title: "Social Media Promotion", description: "Your high-margin products with healthy inventory levels would do well with targeted social ads." },
      { id: 3, title: "Bundle Promotion", description: "Create product bundles to move slow-moving inventory while promoting related items." },
    ]
  });
};

export default function MarketingRecommendations() {
  const { recommendations } = useLoaderData();
  
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
    recommendationTitle: {
      fontSize: '18px',
      fontWeight: 'bold',
      marginBottom: '8px',
      color: '#212B36',
    },
    recommendationDescription: {
      fontSize: '14px',
      color: '#637381',
      lineHeight: '1.5',
    }
  };
  
  return (
    <div style={styles.container}>
      <h1 style={styles.header}>Marketing Recommendations</h1>
      
      {recommendations.map(recommendation => (
        <div key={recommendation.id} style={styles.card}>
          <h2 style={styles.recommendationTitle}>{recommendation.title}</h2>
          <p style={styles.recommendationDescription}>{recommendation.description}</p>
        </div>
      ))}
    </div>
  );
} 