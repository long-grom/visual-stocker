import React from 'react';
import {
  EmptyState,
  Page,
  Layout,
  Card,
  Text,
  BlockStack
} from '@shopify/polaris';

export function EmptyStateExample() {
  return (
    <Page title="Empty State Example">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <EmptyState
                heading="No products found"
                image="/images/empty-state.svg"
              >
                <Text as="p" variant="bodyMd">
                  Try changing your search or filter criteria.
                </Text>
              </EmptyState>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 