/**
 * Calculates original and discounted totals for a product item based on store offers.
 */
export const getItemTotals = (product: any, allStoreItems: any[], storeOffer: any) => {
  const originalTotal = product.product_price * product.quantity;
  if (!storeOffer) return { original: originalTotal, discounted: originalTotal };

  // Resolve the product's UUID from whichever field is available:
  // - product_id: present in direct Supabase query results
  // - products.id: present in RPC results (get_nearby_unassigned_orders)
  const productId = product.product_id || product.products?.id || product.id;

  let discountedTotal = originalTotal;

  switch (storeOffer.type) {
    case 'discount':
      discountedTotal = originalTotal * (1 - storeOffer.amount / 100);
      break;
    case 'free_cash':
      const totalStoreAmount = allStoreItems.reduce((acc: any, curr: any) => acc + curr.product_price * curr.quantity, 0);
      const proportion = originalTotal / (totalStoreAmount || 1);
      discountedTotal = originalTotal - (storeOffer.amount * proportion);
      break;
    case 'cheap_product':
      if (storeOffer.conditions?.product_ids?.includes(productId)) {
        discountedTotal = originalTotal * (1 - storeOffer.amount / 100);
      }
      break;
    case 'fixed_price':
      if (storeOffer.reward_data?.product_ids?.includes(productId)) {
        discountedTotal = storeOffer.amount * product.quantity;
      }
      break;
    case 'combo':
      if (storeOffer.reward_data?.product_ids?.includes(productId)) {
        // Only 1 unit of each product participates in the bundle; extra units are full price
        const comboItemIds = storeOffer.reward_data?.product_ids || [];
        const comboItems = allStoreItems.filter((i: any) => {
          const iId = i.product_id || i.products?.id || i.id;
          return comboItemIds.includes(iId);
        });
        const comboBundleOriginal = comboItems.reduce((acc: any, curr: any) => acc + curr.product_price, 0); // 1 of each unit
        const totalBundleDiscount = Math.max(0, comboBundleOriginal - storeOffer.amount);
        const myProportion = product.product_price / (comboBundleOriginal || 1);
        const myBundleDiscount = totalBundleDiscount * myProportion; // discount on exactly 1 unit
        // 1 discounted unit + (quantity - 1) full price units
        discountedTotal = (product.product_price - myBundleDiscount) + (product.product_price * (product.quantity - 1));
      }
      break;
    case 'free_product':
      if (product.selected_options?.gift === 'true') {
        discountedTotal = 0;
      }
      break;
  }

  return { 
    original: originalTotal, 
    discounted: Math.max(0, discountedTotal)
  };
};
