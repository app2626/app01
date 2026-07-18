import { useState, useCallback, useEffect } from "react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import CartDrawer from "./components/CartDrawer";
import Toast from "./components/Toast";
import AuthModal from "./components/AuthModal";
import HomePage from "./pages/HomePage";
import CategoryPage from "./pages/CategoryPage";
import ProductDetailPage from "./pages/ProductDetailPage";
import PromotionsPage from "./pages/PromotionsPage";
import CouponsPage from "./pages/CouponsPage";
import CheckoutPage from "./pages/CheckoutPage";
import OrdersPage from "./pages/OrdersPage";
import WishlistPage from "./pages/WishlistPage";
import AdminPage from "./pages/AdminPage";
import PromoPopupModal from "./components/PromoPopupModal";
import { MOCK_PRODUCTS, GIFTS } from "./data/products";
import { defaultFilters } from "./utils/filters";
import { loadState, saveState, clearState, mergeCarts } from "./utils/storage";
import { callGas } from "./utils/gas";
import { getPromoPopupLocal, getHeroBannersLocal, getCouponsLocal, getPromotionsLocal, getInstallmentSettingsLocal, getCartLocal, saveCartLocal } from "./utils/localMock";

function resolveLocalGifts(products) {
  return products.map(p => ({
    ...p,
    freeGiftItems: (p.giftIds || []).map(gid => GIFTS.find(g => g.id === gid)).filter(Boolean)
  }));
}

export default function App() {
  const [products, setProducts] = useState(() => resolveLocalGifts(MOCK_PRODUCTS));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ถ้ารันอยู่บน Google Apps Script จะมี google.script.run ให้ใช้งาน
    if (typeof google !== "undefined" && google.script && google.script.run) {
      google.script.run
        .withSuccessHandler((data) => {
          try {
            const parsed = typeof data === "string" ? JSON.parse(data) : data;
            setProducts(parsed);
          } catch (e) {
            console.error("Error parsing data", e);
          }
          setLoading(false);
        })
        .withFailureHandler((err) => {
          console.error("Failed to load data:", err);
          setLoading(false);
        })
        .getProductsData();
    } else {
      // สำหรับทดสอบบน Local ด้วย Vite (npm run dev)
      setTimeout(() => {
        setProducts(resolveLocalGifts(MOCK_PRODUCTS));
        setLoading(false);
      }, 500);
    }
  }, []);

  const [page, setPage] = useState("home"); // "home" | "category" | "detail" | "promotions" | "coupons" | "checkout"
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cart, setCart] = useState(() => loadState("cart", []));
  const [showCart, setShowCart] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [filters, setFilters] = useState(defaultFilters());
  const [member, setMember] = useState(() => loadState("member", null));
  const [showAuth, setShowAuth] = useState(false);
  const [collectedCoupons, setCollectedCoupons] = useState(() => loadState("coupons", []));
  const [wishlist, setWishlist] = useState(() => loadState("wishlist", []));
  const [promoPopup, setPromoPopup] = useState(null);
  const [heroBanners, setHeroBanners] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [installmentSettings, setInstallmentSettings] = useState(null);
  const [cartSynced, setCartSynced] = useState(false);

  useEffect(() => {
    if (!member) {
      setCartSynced(false);
      return;
    }
    setCartSynced(false);
    callGas("getCart", [member.email], getCartLocal)
      .then(serverCart => {
        setCart(prev => mergeCarts(serverCart, prev));
        setCartSynced(true);
      })
      .catch(() => setCartSynced(true));
  }, [member?.email]);

  useEffect(() => {
    if (!member || !cartSynced) return;
    callGas("saveCart", [member.email, cart], saveCartLocal).catch(() => {});
  }, [cart, member, cartSynced]);

  useEffect(() => {
    if (sessionStorage.getItem("supper_store_promo_dismissed")) return;
    callGas("getPromoPopup", [], getPromoPopupLocal)
      .then(popup => { if (popup.enabled) setPromoPopup(popup); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    callGas("getHeroBanners", [], getHeroBannersLocal)
      .then(setHeroBanners)
      .catch(() => {});
  }, []);

  useEffect(() => {
    callGas("getCoupons", [], getCouponsLocal)
      .then(setCoupons)
      .catch(() => {});
  }, []);

  useEffect(() => {
    callGas("getPromotions", [], getPromotionsLocal)
      .then(setPromotions)
      .catch(() => {});
  }, []);

  useEffect(() => {
    callGas("getInstallmentSettings", [], getInstallmentSettingsLocal)
      .then(setInstallmentSettings)
      .catch(() => {});
  }, []);

  const dismissPromoPopup = () => {
    sessionStorage.setItem("supper_store_promo_dismissed", "1");
    setPromoPopup(null);
  };

  const handlePromoNavigate = (type, value) => {
    if (type === "category") handleSelectCategory(value);
    else handleNavigate(type);
  };

  useEffect(() => { saveState("cart", cart); }, [cart]);
  useEffect(() => { saveState("coupons", collectedCoupons); }, [collectedCoupons]);
  useEffect(() => { saveState("wishlist", wishlist); }, [wishlist]);
  useEffect(() => {
    if (member) saveState("member", member);
    else clearState("member");
  }, [member]);

  const showSuccessToast = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const addToCart = useCallback((product, qty, color, variant) => {
    setCart(prev => {
      const existingIdx = prev.findIndex(item =>
        item.product.id === product.id &&
        item.selectedColor === color &&
        item.selectedVariant.label === variant.label
      );

      if (existingIdx >= 0) {
        const newCart = [...prev];
        newCart[existingIdx].qty += qty;
        return newCart;
      }

      return [...prev, {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        product,
        qty,
        selectedColor: color,
        selectedVariant: variant
      }];
    });
    showSuccessToast();
  }, []);

  const removeFromCart = useCallback((id) => {
    setCart(prev => prev.filter(item => item.id !== id));
  }, []);

  const updateQty = useCallback((id, qty) => {
    setCart(prev => prev.map(item => item.id === id ? { ...item, qty } : item));
  }, []);

  const goHome = () => {
    setPage("home");
    window.scrollTo(0, 0);
  };

  const handleNavigate = (targetPage) => {
    setPage(targetPage);
    window.scrollTo(0, 0);
  };

  const handleSelectCategory = (slug) => {
    setSelectedCategory(slug);
    setFilters({ ...defaultFilters() });
    setPage("category");
    window.scrollTo(0, 0);
  };

  const handleSearch = (query) => {
    setSelectedCategory(null);
    setFilters({ ...defaultFilters(), searchQuery: query });
    setPage("category");
    window.scrollTo(0, 0);
  };

  const handleProductClick = (product) => {
    setSelectedProduct(product);
    setPage("detail");
    window.scrollTo(0, 0);
  };

  const handleBuyNow = (product, qty, color, variant) => {
    addToCart(product, qty, color, variant);
    setShowCart(true);
  };

  const handleCheckout = () => {
    setShowCart(false);
    setPage("checkout");
    window.scrollTo(0, 0);
  };

  const handleOrderComplete = () => {
    setCart([]);
  };

  const handleCollectCoupon = (coupon) => {
    setCollectedCoupons(prev => prev.includes(coupon.code) ? prev : [...prev, coupon.code]);
  };

  const handleToggleWishlist = (productId) => {
    setWishlist(prev => prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]);
  };

  if (loading) {
    return <div className="min-h-screen bg-[#F5F5F5] flex items-center justify-center font-medium text-lg">กำลังโหลดข้อมูลสินค้า...</div>;
  }

  return (
    <div className="min-h-screen bg-[#F5F5F5] font-sans text-gray-900 flex flex-col">
      <Header
        cart={cart}
        onCartClick={() => setShowCart(true)}
        onLogoClick={goHome}
        searchQuery={filters.searchQuery}
        onSearch={handleSearch}
        onSelectCategory={handleSelectCategory}
        member={member}
        onLoginClick={() => setShowAuth(true)}
        onLogout={() => setMember(null)}
        onNavigate={handleNavigate}
        wishlistCount={wishlist.length}
      />

      <main className="flex-1">
        {page === "home" && (
          <HomePage products={products} onProductClick={handleProductClick} heroBanners={heroBanners} onNavigate={handlePromoNavigate} />
        )}

        {page === "category" && (
          <CategoryPage
            categorySlug={selectedCategory}
            allProducts={products}
            filters={filters}
            onFiltersChange={setFilters}
            onProductClick={handleProductClick}
            onGoHome={goHome}
          />
        )}

        {page === "detail" && selectedProduct && (
          <ProductDetailPage
            product={selectedProduct}
            onAddToCart={addToCart}
            onBuyNow={handleBuyNow}
            onBack={goHome}
            onSelectCategory={handleSelectCategory}
            isWishlisted={wishlist.includes(selectedProduct.id)}
            onToggleWishlist={handleToggleWishlist}
            member={member}
            onLoginRequired={() => setShowAuth(true)}
            installmentSettings={installmentSettings}
          />
        )}

        {page === "promotions" && (
          <PromotionsPage products={products} onProductClick={handleProductClick} />
        )}

        {page === "coupons" && (
          <CouponsPage coupons={coupons} collectedCoupons={collectedCoupons} onCollect={handleCollectCoupon} />
        )}

        {page === "checkout" && (
          <CheckoutPage
            cart={cart}
            member={member}
            coupons={coupons}
            promotions={promotions}
            collectedCoupons={collectedCoupons}
            onOrderComplete={handleOrderComplete}
            onGoHome={goHome}
            onPointsUpdated={(points) => setMember(prev => prev ? { ...prev, points } : prev)}
          />
        )}

        {page === "orders" && (
          <OrdersPage member={member} onGoHome={goHome} />
        )}

        {page === "wishlist" && (
          <WishlistPage products={products} wishlist={wishlist} onProductClick={handleProductClick} />
        )}

        {page === "admin" && (
          <AdminPage member={member} />
        )}
      </main>

      <Footer onSelectCategory={handleSelectCategory} />

      <CartDrawer
        show={showCart}
        cart={cart}
        onClose={() => setShowCart(false)}
        onUpdateQty={updateQty}
        onRemove={removeFromCart}
        onCheckout={handleCheckout}
      />

      <AuthModal
        show={showAuth}
        onClose={() => setShowAuth(false)}
        onLoggedIn={(m) => { setMember(m); setShowAuth(false); }}
      />

      <Toast show={showToast} message="เพิ่มสินค้าลงตะกร้าแล้ว" />

      {promoPopup && (
        <PromoPopupModal
          popup={promoPopup}
          onClose={dismissPromoPopup}
          onNavigate={handlePromoNavigate}
        />
      )}
    </div>
  );
}
