/**
 * Update food stats for bestseller calculation.
 * This utility tracks which food items are ordered most frequently.
 * @param {Object} order - The order object containing items and status
 */
export async function updateFoodStats(order) {
  // For now, this is a placeholder that tracks orders in memory or logs them.
  // In a production system, you would:
  // 1. Increment a sales counter for each food item in the order
  // 2. Update timestamps for popularity calculations
  // 3. Store this data in a separate stats collection or cache
  
  if (!order || !order.items || !Array.isArray(order.items)) {
    return;
  }

  // Track that these items were ordered
  order.items.forEach((item) => {
    // Stats tracking could be extended here
    // For example: stats.increment(item.clientId, item.quantity)
  });
}
