'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

type Reservation = {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: string;
  expiresAt: string;
  createdAt: string;
};

type Toast = { id: number; message: string; type: 'success' | 'error' };

export default function CheckoutPage({ params }: { params: { id: string } }) {
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const router = useRouter();

  const addToast = (message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  // fetch reservation details
  useEffect(() => {
    // we don't have a GET /api/reservations/:id route, so we'll fetch from
    // the products endpoint and find it. Actually, let me just add inline fetch.
    // For now, store reservation data in localStorage when navigating here.
    // Actually that's hacky. Let me just fetch it.

    const fetchReservation = async () => {
      try {
        const res = await fetch(`/api/reservations/${params.id}`);
        if (!res.ok) throw new Error('not found');
        const data = await res.json();
        setReservation(data);
      } catch {
        addToast('Reservation not found', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchReservation();
  }, [params.id]);

  // countdown timer
  useEffect(() => {
    if (!reservation || reservation.status !== 'pending') return;

    const update = () => {
      const diff = Math.max(0, new Date(reservation.expiresAt).getTime() - Date.now());
      setSecondsLeft(Math.ceil(diff / 1000));
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [reservation]);

  // auto-refresh when timer hits 0
  useEffect(() => {
    if (secondsLeft === 0 && reservation?.status === 'pending') {
      // reservation expired, refresh to show updated status
      setTimeout(async () => {
        try {
          const res = await fetch(`/api/reservations/${params.id}`);
          const data = await res.json();
          setReservation(data);
        } catch {}
      }, 1000);
    }
  }, [secondsLeft, reservation, params.id]);

  const handleConfirm = async () => {
    setActing(true);
    try {
      const res = await fetch(`/api/reservations/${params.id}/confirm`, {
        method: 'POST',
      });

      if (res.status === 410) {
        addToast('Reservation has expired! Your hold has been released.', 'error');
        // refetch to show updated status
        const updated = await fetch(`/api/reservations/${params.id}`);
        if (updated.ok) setReservation(await updated.json());
        return;
      }

      if (!res.ok) {
        const err = await res.json();
        addToast(err.error || 'Failed to confirm', 'error');
        return;
      }

      const data = await res.json();
      setReservation(data);
      addToast('Purchase confirmed!', 'success');
    } catch {
      addToast('Network error', 'error');
    } finally {
      setActing(false);
    }
  };

  const handleCancel = async () => {
    setActing(true);
    try {
      const res = await fetch(`/api/reservations/${params.id}/release`, {
        method: 'POST',
      });

      if (!res.ok) {
        const err = await res.json();
        addToast(err.error || 'Failed to cancel', 'error');
        return;
      }

      const data = await res.json();
      setReservation(data);
      addToast('Reservation cancelled. Stock has been released.', 'success');
    } catch {
      addToast('Network error', 'error');
    } finally {
      setActing(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-gray-400 text-lg">Loading reservation...</div>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div className="text-center py-16">
        <h1 className="text-xl font-semibold text-gray-600">Reservation not found</h1>
        <button
          onClick={() => router.push('/')}
          className="mt-4 text-blue-600 hover:underline"
        >
          Back to products
        </button>
      </div>
    );
  }

  const isPending = reservation.status === 'pending';
  const isConfirmed = reservation.status === 'confirmed';
  const isReleased = reservation.status === 'released';
  const isExpired = isPending && secondsLeft <= 0;

  return (
    <div className="max-w-lg mx-auto">
      <button
        onClick={() => router.push('/')}
        className="text-blue-600 hover:underline text-sm mb-6 inline-block"
      >
        ← Back to products
      </button>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h1 className="text-xl font-bold mb-4">
          {isPending ? 'Checkout' : isConfirmed ? 'Order Confirmed' : 'Reservation Released'}
        </h1>

        {/* reservation details */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-500">Reservation ID</span>
            <span className="font-mono text-xs">{reservation.id}</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-500">Quantity</span>
            <span>{reservation.quantity} unit(s)</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-500">Status</span>
            <span className={`font-medium ${
              isConfirmed ? 'text-green-600' : isReleased ? 'text-red-500' : 'text-amber-500'
            }`}>
              {reservation.status.toUpperCase()}
              {isExpired && ' (EXPIRED)'}
            </span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-gray-500">Created</span>
            <span>{new Date(reservation.createdAt).toLocaleString()}</span>
          </div>
        </div>

        {/* countdown */}
        {isPending && (
          <div className="mt-6 text-center">
            {!isExpired ? (
              <div>
                <p className="text-gray-500 text-sm mb-1">Reservation expires in</p>
                <div
                  className={`text-4xl font-bold font-mono ${
                    secondsLeft <= 60
                      ? 'text-red-500 countdown-urgent'
                      : secondsLeft <= 180
                        ? 'text-amber-500'
                        : 'text-gray-800'
                  }`}
                >
                  {formatTime(secondsLeft)}
                </div>
                {/* progress bar */}
                <div className="mt-3 w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      secondsLeft <= 60 ? 'bg-red-500' : secondsLeft <= 180 ? 'bg-amber-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(100, (secondsLeft / 600) * 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="py-4 px-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-red-600 font-medium">Reservation has expired</p>
                <p className="text-red-500 text-sm mt-1">
                  Your held units have been released back to available stock.
                </p>
              </div>
            )}
          </div>
        )}

        {/* confirmed state */}
        {isConfirmed && (
          <div className="mt-6 py-4 px-4 bg-green-50 rounded-lg border border-green-200 text-center">
            <p className="text-green-700 font-medium text-lg">Payment Successful!</p>
            <p className="text-green-600 text-sm mt-1">
              Your order has been confirmed and stock has been allocated.
            </p>
          </div>
        )}

        {/* released state */}
        {isReleased && (
          <div className="mt-6 py-4 px-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
            <p className="text-gray-600 font-medium">Reservation Cancelled</p>
            <p className="text-gray-500 text-sm mt-1">
              The reserved units have been returned to available stock.
            </p>
          </div>
        )}

        {/* actions */}
        {isPending && !isExpired && (
          <div className="mt-6 flex gap-3">
            <button
              onClick={handleConfirm}
              disabled={acting}
              className="flex-1 bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:bg-green-300 transition-colors"
            >
              {acting ? 'Processing...' : 'Confirm Purchase'}
            </button>
            <button
              onClick={handleCancel}
              disabled={acting}
              className="flex-1 bg-white text-gray-700 py-3 rounded-lg font-medium border border-gray-300 hover:bg-gray-50 disabled:text-gray-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* back button for terminal states */}
        {(isConfirmed || isReleased || isExpired) && (
          <button
            onClick={() => router.push('/')}
            className="mt-6 w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Browse Products
          </button>
        )}
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
