import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Allo Inventory',
  description: 'Inventory reservation system for multi-warehouse retail',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <nav className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <a href="/" className="text-lg font-semibold text-blue-600">
              Allo Inventory
            </a>
            <span className="text-sm text-gray-500">Reservation System</span>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
