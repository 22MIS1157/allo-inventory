'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

type Inventory = {
  id: string;
  total: number;
  reserved: number;
  available: number;
  warehouse: { id: string; name: string; location: string };
};

type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image: string | null;
  inventory: Inventory[];
};

type Toast = {
  id: number;
  message: string;
  type: 'success' | 'error';
};

export default function HomePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [reserving, setReserving] = useState<string | null>(null); // inventoryId being reserved
  const [toasts, setToasts] = useState<Toast[]>([]);
  const router = useRouter();

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(data);
    } catch {
      addToast('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const handleReserve = async (productId: string, warehouseId: string, inventoryId: string) => {
    setReserving(inventoryId);
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, warehouseId, quantity: 1 }),
      });

      if (res.status === 409) {
        addToast('Not enough stock available! Someone else may have reserved it.', 'error');
        fetchProducts(); // refresh stock numbers
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        addToast(err.error || 'Something went wrong', 'error');
        return;
      }

      const reservation = await res.json();
      addToast('Reserved! Redirecting to checkout...', 'success');
      setTimeout(() => {
        router.push(`/checkout/${reservation.id}`);
      }, 800);
    } catch {
      addToast('Network error, please try again', 'error');
    } finally {
      setReserving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-400 text-lg">Loading products...</div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Products</h1>
      <p className="text-gray-500 mb-6">
        Reserve units to hold stock during checkout. Reservations expire in 10 minutes.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => (
          <div key={product.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            {product.image && (
              <img
                src={product.image}
                alt={product.name}
                className="w-full h-48 object-cover"
              />
            )}
            <div className="p-4">
              <h2 className="font-semibold text-lg">{product.name}</h2>
              {product.description && (
                <p className="text-gray-500 text-sm mt-1">{product.description}</p>
              )}
              <p className="text-blue-600 font-bold text-lg mt-2">
                ₹{product.price.toLocaleString('en-IN')}
              </p>

              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  Stock by Warehouse
                </p>
                {product.inventory.length === 0 && (
                  <p className="text-sm text-gray-400">Not available</p>
                )}
                {product.inventory.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded text-sm"
                  >
                    <div>
                      <span className="font-medium">{inv.warehouse.name}</span>
                      <span className="text-gray-400 ml-2">
                        {inv.available} available
                        {inv.reserved > 0 && (
                          <span className="text-amber-500"> ({inv.reserved} reserved)</span>
                        )}
                      </span>
                    </div>
                    <button
                      onClick={() => handleReserve(product.id, inv.warehouse.id, inv.id)}
                      disabled={inv.available <= 0 || reserving === inv.id}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        inv.available <= 0
                          ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                          : reserving === inv.id
                            ? 'bg-blue-300 text-white cursor-wait'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {reserving === inv.id ? 'Reserving...' : inv.available <= 0 ? 'Out of Stock' : 'Reserve'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* toasts */}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast-enter px-4 py-3 rounded-lg shadow-lg text-sm text-white max-w-sm ${
              toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
