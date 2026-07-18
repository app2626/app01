function matchesGroup(item, group) {
  if (group.type === "category") return group.ids.includes(item.product.category);
  return group.ids.includes(item.product.id);
}

export function calcApplicablePromotions(cart, promotions) {
  const appliedPromotions = [];
  let totalDiscount = 0;

  (promotions || []).forEach(promo => {
    const groups = promo.groups || [];
    if (groups.length === 0) return;
    const minQtyEach = promo.minQtyEach || 1;

    const groupMatches = groups.map(group => {
      const matchingItems = (cart || []).filter(item => matchesGroup(item, group));
      const totalQty = matchingItems.reduce((sum, item) => sum + item.qty, 0);
      return { matchingItems, totalQty };
    });

    const qualifies = groupMatches.every(g => g.totalQty >= minQtyEach);
    if (!qualifies) return;

    let amount = 0;
    if (promo.discountType === "percent") {
      const base = groupMatches.reduce((sum, g) => {
        let remaining = minQtyEach;
        let groupValue = 0;
        for (const item of g.matchingItems) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, item.qty);
          groupValue += take * item.selectedVariant.price;
          remaining -= take;
        }
        return sum + groupValue;
      }, 0);
      amount = base * (promo.value / 100);
    } else {
      amount = promo.value;
    }

    if (amount > 0) {
      appliedPromotions.push({ id: promo.id, label: promo.label, amount });
      totalDiscount += amount;
    }
  });

  return { appliedPromotions, totalDiscount };
}
