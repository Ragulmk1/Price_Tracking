import Product from "@/lib/actions/models/product.model";
import { connectToDB } from "@/lib/actions/mongoose";
import { generateEmailBody, sendEmail } from "@/lib/actions/nodemailer";
import { scrapeAmazonProduct } from "@/lib/actions/scraper";
import { getAveragePrice, getEmailNotifType, getHighestPrice, getLowestPrice } from "@/lib/actions/utils";
import { NextResponse } from "next/server";



export const maxDuration = 300; // This function can run for a maximum of 300 seconds
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    await connectToDB();

    const products = await Product.find({});
    if (!products) throw new Error("No products found");

    const updatedProducts = await Promise.all(
      products.map(async (currentProduct) => {
        const scrapedProduct = await scrapeAmazonProduct(currentProduct.url);
        if (!scrapedProduct) throw new Error('No product found');

        const updatedPriceHistory = [
          ...currentProduct.priceHistory,
          { price: scrapedProduct.currentPrice },
        ];

        const product = {
          ...scrapedProduct,
          priceHistory: updatedPriceHistory,
          lowestPrice: getLowestPrice(updatedPriceHistory),
          highestPrice: getHighestPrice(updatedPriceHistory),
          averagePrice: getAveragePrice(updatedPriceHistory),
        };

        const updatedProduct = await Product.findOneAndUpdate(
          { url: scrapedProduct.url },

          product,
        );

        const emailNotifType = await getEmailNotifType(scrapedProduct, currentProduct);
        if (emailNotifType && updatedProduct.users.length > 0) {
          const productInfo = { title: updatedProduct.title, url: updatedProduct.url };
          const emailContent = await generateEmailBody(productInfo, emailNotifType);
          const userEmails = updatedProduct.users.map((user:any) => user.email);
          await sendEmail(emailContent, userEmails);
        }

        return updatedProduct;
      })
    );

    return NextResponse.json({
      message: "Ok",
      data: updatedProducts,
    });
    } catch (error: any) {
      throw new Error(`Failed to get all products: ${error.message}`);
  }
}
