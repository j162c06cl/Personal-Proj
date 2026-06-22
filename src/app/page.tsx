import Link from "next/link";

const features = [
  {
    href: "/watchlist",
    title: "Watchlist",
    description: "Track stocks and ETFs you're watching. Organised by category with live prices, market cap, P/E ratio and more.",
    icon: "📋",
    color: "from-blue-600 to-blue-800",
  },
  {
    href: "/calculator",
    title: "Historical Calculator",
    description: "See what any investment would be worth today. Enter a stock, a date, and an amount to find out.",
    icon: "🧮",
    color: "from-purple-600 to-purple-800",
  },
  {
    href: "/portfolio",
    title: "Test Portfolio",
    description: "Simulate a portfolio without real money. Track positions, current value, and overall returns.",
    icon: "📈",
    color: "from-emerald-600 to-emerald-800",
  },
  {
    href: "/glossary",
    title: "Glossary",
    description: "Plain-English definitions for common investing terms like ETFs, REITs, P/E Ratio, CAGR and more.",
    icon: "📖",
    color: "from-amber-600 to-amber-800",
  },
];

export default function Home() {
  return (
    <div>
      <div className="mb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Investor Research</h1>
        <p className="text-gray-400 text-sm sm:text-base">Your personal stock and ETF research assistant</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {features.map((f) => (
          <Link key={f.href} href={f.href}>
            <div className={`bg-gradient-to-br ${f.color} rounded-xl p-6 hover:scale-[1.02] transition-transform cursor-pointer h-full`}>
              <div className="text-3xl mb-3">{f.icon}</div>
              <h2 className="text-xl font-bold text-white mb-2">{f.title}</h2>
              <p className="text-white/80 text-sm leading-relaxed">{f.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
