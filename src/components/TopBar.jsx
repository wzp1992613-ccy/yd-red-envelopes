import React from "react";

const CHAIN_OPTIONS = [
  { label: "Ganache 1337", value: "0x539" },
  { label: "Ganache 5777", value: "0x1691" },
  { label: "Sepolia", value: "0xaa36a7" },
  { label: "Ethereum Mainnet", value: "0x1" }
];

export default function TopBar({
  account,
  onConnect,
  onSwitchChain,
  selectedChain
}) {
  const displayAccount = account
    ? `${account.slice(0, 6)}...${account.slice(-4)}`
    : "未连接钱包";
  return (
    <header className="topbar">
      <h1>RedPacket Vite</h1>
      <div className="topbar-actions">
        <span className="wallet-label" title={account || ""}>
          {displayAccount}
        </span>
        <div className="topbar-controls">
          <button type="button" onClick={onConnect}>
            连接钱包
          </button>
          <select
            className="chain-select"
            value={selectedChain}
            onChange={(event) => onSwitchChain(event.target.value)}
          >
            {CHAIN_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
}
