import { Order } from "../models/Order.js";

/**
 * Deliver decision email for an order (Verified or Rejected notification)
 * @param {string} orderId - The order ID to send decision email for
 */
export async function deliverDecisionEmailForOrder(orderId) {
  let order = null;

  try {
    order = await Order.findById(orderId).lean();
    
    if (!order) {
      throw new Error(`Order not found: ${orderId}`);
    }

    // Get decision type and email details
    const decisionType = order.decisionEmail?.type; // "Verified" or "Rejected"
    const email = order.team?.email;
    
    if (!decisionType || !email) {
      throw new Error("Missing decision type or email address");
    }

    // Email subject and content based on decision
    const subject = decisionType === "Verified" 
      ? "Your order has been verified!"
      : "Your order has been rejected";

    const emailBody = decisionType === "Verified"
      ? `Your order #${order.transactionIdNormalized} has been verified and accepted.`
      : `Your order #${order.transactionIdNormalized} has been rejected. Reason: ${order.rejectionReason || "Not specified"}`;

    // TODO: Integrate with email service (nodemailer, SendGrid, etc.)
    // For now, just log the action
    // eslint-disable-next-line no-console
    console.log(`[Email] Would send ${decisionType} email to ${email}:`, { subject, emailBody });

    // Update the order to mark email as sent
    await Order.updateOne(
      { _id: orderId },
      {
        $set: {
          "decisionEmail.status": "sent",
          "decisionEmail.sentAt": new Date(),
          "decisionEmail.lastAttemptAt": new Date(),
        },
      }
    );

  } catch (error) {
    // Mark email as failed
    await Order.updateOne(
      { _id: orderId },
      {
        $set: {
          "decisionEmail.status": "failed",
          "decisionEmail.lastError": error?.message || "Unknown error",
          "decisionEmail.lastAttemptAt": new Date(),
        },
        $inc: {
          "decisionEmail.attempts": 1,
        },
      }
    ).catch(() => {}); // Ignore errors when updating failure status

    throw error;
  }
}
