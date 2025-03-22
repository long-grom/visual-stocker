import { json } from "@remix-run/node";
import { Form } from "@remix-run/react";
import { Page, Layout, Card, Button, Banner } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);

  const testProducts = [
    {
      title: "Spring Surf Suit",
      productType: "Wetsuit",
      variants: [
        { size: "XS", color: "Coral Pink", inventory: 5 },
        { size: "S", color: "Coral Pink", inventory: 8 },
        { size: "M", color: "Coral Pink", inventory: 3 },
        { size: "L", color: "Coral Pink", inventory: 0 },
        { size: "XS", color: "Ocean Blue", inventory: 2 },
        { size: "S", color: "Ocean Blue", inventory: 7 },
        { size: "M", color: "Ocean Blue", inventory: 4 },
        { size: "L", color: "Ocean Blue", inventory: 1 },
      ],
    },
    {
      title: "Summer One Piece",
      productType: "Swimsuit",
      variants: [
        { size: "XS", color: "Lavender", inventory: 10 },
        { size: "S", color: "Lavender", inventory: 6 },
        { size: "M", color: "Lavender", inventory: 0 },
        { size: "L", color: "Lavender", inventory: 4 },
        { size: "XS", color: "Mint", inventory: 3 },
        { size: "S", color: "Mint", inventory: 8 },
        { size: "M", color: "Mint", inventory: 5 },
        { size: "L", color: "Mint", inventory: 2 },
      ],
    },
    {
      title: "Classic Bikini",
      productType: "Swimsuit",
      variants: [
        { size: "XS", color: "Black", inventory: 15 },
        { size: "S", color: "Black", inventory: 12 },
        { size: "M", color: "Black", inventory: 8 },
        { size: "L", color: "Black", inventory: 6 },
        { size: "XS", color: "White", inventory: 9 },
        { size: "S", color: "White", inventory: 7 },
        { size: "M", color: "White", inventory: 4 },
        { size: "L", color: "White", inventory: 3 },
      ],
    },
  ];

  try {
    for (const product of testProducts) {
      // Create product
      const createProduct = await admin.graphql(`
        mutation createProduct($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `, {
        variables: {
          input: {
            title: product.title,
            productType: product.productType,
            variants: product.variants.map(variant => ({
              options: [variant.size, variant.color],
              inventoryQuantities: {
                availableQuantity: variant.inventory,
                locationId: "gid://shopify/Location/1" // Default location
              }
            }))
          }
        }
      });

      const response = await createProduct.json();
      if (response.data.productCreate.userErrors.length > 0) {
        throw new Error(response.data.productCreate.userErrors[0].message);
      }
    }

    return json({ status: "success", message: "Test products created successfully!" });
  } catch (error) {
    return json({ status: "error", message: error.message }, { status: 500 });
  }
}

export default function TestData() {
  return (
    <Page title="Generate Test Data">
      <Layout>
        <Layout.Section>
          <Card>
            <Form method="post">
              <Button submit>Generate Test Products</Button>
            </Form>
          </Card>
        </Layout.Section>
        <Layout.Section>
          <Banner title="Note" status="info">
            This will create sample products with various sizes, colors, and inventory levels to help test the inventory visualization.
            The following test data will be created:
            <ul>
              <li>Spring Surf Suit (Wetsuit) - 8 variants</li>
              <li>Summer One Piece (Swimsuit) - 8 variants</li>
              <li>Classic Bikini (Swimsuit) - 8 variants</li>
            </ul>
            Each product will have variants in different sizes (XS, S, M, L) and colors with varying inventory levels.
          </Banner>
        </Layout.Section>
      </Layout>
    </Page>
  );
} 