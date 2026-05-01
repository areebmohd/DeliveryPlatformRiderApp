/**
 * Calculates original and discounted totals for a product item based on store offers.
 */
export const getItemTotals = (product: any, allStoreItems: any[], storeOffer: any) => {
  const originalTotal = product.product_price * product.quantity;
  if (!storeOffer) return { original: originalTotal, discounted: originalTotal };

  // Helper to check if a product (item) matches a target ID from an offer
  // Handling barcode/name/weight fallback for common products
  const matchesOfferId = (item: any, targetId: string) => {
    // 1. Direct ID match (most common)
    const itemId = item.product_id || item.products?.id || item.id;
    if (itemId === targetId) return true;

    // 2. Identity match for common/barcode products
    // We need the product details (either from join or direct)
    const pDetails = item.products || item;
    // If it's a personal product or we don't have matching info, skip
    if (!pDetails.product_type || pDetails.product_type === 'personal') return false;

    // We also need the details of the targetId.
    const targetProduct = allStoreItems.find(i => (i.product_id || i.products?.id || i.id) === targetId);
    const tpDetails = targetProduct?.products || targetProduct;

    if (tpDetails) {
        if (pDetails.product_type === 'barcode' && pDetails.barcode && tpDetails.barcode === pDetails.barcode) return true;
        return pDetails.name === tpDetails.name && pDetails.weight_kg === tpDetails.weight_kg;
    }

    return false;
  };

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
    case 'cheap_product': {
      const productIds = [...(storeOffer.conditions?.product_ids || []), ...(storeOffer.reward_data?.product_ids || [])];
      if (productIds.some(pid => matchesOfferId(product, pid))) {
        discountedTotal = originalTotal * (1 - storeOffer.amount / 100);
      }
      break;
    }
    case 'fixed_price': {
      const productIds = storeOffer.reward_data?.product_ids || [];
      if (productIds.some(pid => matchesOfferId(product, pid))) {
        discountedTotal = storeOffer.amount * product.quantity;
      }
      break;
    }
    case 'combo': {
      const productIds = storeOffer.reward_data?.product_ids || [];
      if (productIds.some(pid => matchesOfferId(product, pid))) {
        // Only 1 unit of each product participates in the bundle; extra units are full price
        const comboItems = allStoreItems.filter((i: any) => {
            return productIds.some(pid => matchesOfferId(i, pid));
        });
        const comboBundleOriginal = comboItems.reduce((acc: any, curr: any) => acc + curr.product_price, 0); // 1 of each unit
        const totalBundleDiscount = Math.max(0, comboBundleOriginal - storeOffer.amount);
        const myProportion = product.product_price / (comboBundleOriginal || 1);
        const myBundleDiscount = totalBundleDiscount * myProportion; // discount on exactly 1 unit
        // 1 discounted unit + (quantity - 1) full price units
        discountedTotal = (product.product_price - myBundleDiscount) + (product.product_price * (product.quantity - 1));
      }
      break;
    }
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
