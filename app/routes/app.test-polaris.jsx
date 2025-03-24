import { authenticate } from "../shopify.server";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  Box
} from "@shopify/polaris";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return {};
};

export default function PolarisTest() {
  const [count, setCount] = useState(0);
  
  return (
    <Page title="Polaris Test">
      <Layout>
        <Layout.Section>
          <Card>
            <Card.Section>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Basic Polaris Components Test
                </Text>
                <Text as="p" variant="bodyMd">
                  Count: {count}
                </Text>
                <Box>
                  <Button onClick={() => setCount(count + 1)}>
                    Increment
                  </Button>
                </Box>
              </BlockStack>
            </Card.Section>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 