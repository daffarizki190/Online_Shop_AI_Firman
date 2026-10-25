import { useApp } from './store';
import { AdminTabBar, CustomerTabBar, ToastHost } from './ui';
import LoginScreen from './components/LoginScreen';
import CatalogScreen from './components/CatalogScreen';
import ProductScreen from './components/ProductScreen';
import { StudioScreen, FittingScreen } from './components/StudioFitting';
import MirrorScreen from './components/MirrorScreen';
import { BagScreen, ShippingScreen, AddressScreen, PaymentScreen } from './components/CheckoutScreens';
import { SavedScreen, TrackingScreen } from './components/OrderScreens';
import { HelpScreen, AccountScreen } from './components/HelpAccount';
import { AdminDashboard, AdminOrders, AdminReviews, AdminUsers } from './components/AdminScreens';

export default function App() {
  const { s } = useApp();
  const route = s.route;

  return (
    <div className="app-frame" id="app-frame">
      <main className="screens">
        {route === 'login' && <LoginScreen />}
        {route === 'shop' && <CatalogScreen />}
        {route === 'produk' && <ProductScreen />}
        {route === 'studio' && <StudioScreen />}
        {route === 'fitting' && <FittingScreen />}
        {route === 'cermin' && <MirrorScreen />}
        {route === 'saved' && <SavedScreen />}
        {route === 'bag' && <BagScreen />}
        {route === 'pengiriman' && <ShippingScreen />}
        {route === 'alamat' && <AddressScreen />}
        {route === 'pembayaran' && <PaymentScreen />}
        {route === 'pesanan' && <TrackingScreen />}
        {route === 'bantuan' && <HelpScreen />}
        {route === 'akun' && <AccountScreen />}
        {route === 'admin' && <AdminDashboard />}
        {route === 'admin-pesanan' && <AdminOrders />}
        {route === 'admin-ulasan' && <AdminReviews />}
        {route === 'admin-pengguna' && <AdminUsers />}
      </main>
      <CustomerTabBar />
      <AdminTabBar />
      <ToastHost />
    </div>
  );
}
