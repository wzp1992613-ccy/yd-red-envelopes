import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import TopBar from "./components/TopBar.jsx";
import artifact from "../RedPacket.json";

const RPC_URL = import.meta.env.VITE_RPC_URL || "http://127.0.0.1:7545";
const DEFAULT_CONTRACT = import.meta.env.VITE_CONTRACT_ADDRESS || "";
const EXPECTED_CHAIN_ID = BigInt(import.meta.env.VITE_CHAIN_ID || "1337");
const CHAIN_HEX = import.meta.env.VITE_CHAIN_HEX || "0x539";

const formatEth = (value) => ethers.formatEther(value || 0n);

export default function App() {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState("");
  const [contract, setContract] = useState(null);
  const [contractAddress, setContractAddress] = useState("");
  const [rpcUrl, setRpcUrl] = useState(RPC_URL);
  const [status, setStatus] = useState("请连接钱包并确认网络");
  const [statusError, setStatusError] = useState(false);
  const [count, setCount] = useState("-");
  const [balance, setBalance] = useState("-");
  const [isEqual, setIsEqual] = useState("-");
  const [roundId, setRoundId] = useState("-");
  const [grabHint, setGrabHint] = useState("未加载轮次");
  const [grabDisabled, setGrabDisabled] = useState(true);
  const [eventLogs, setEventLogs] = useState([]);
  const [selectedChain, setSelectedChain] = useState(CHAIN_HEX);
  const [isConnecting, setIsConnecting] = useState(false);
  const [createForm, setCreateForm] = useState({
    amount: "",
    count: "",
    isEqual: false
  });

  const networkAddress = useMemo(() => {
    const network = artifact.networks?.["5777"];
    return DEFAULT_CONTRACT || network?.address || "";
  }, []);

  useEffect(() => {
    if (networkAddress) {
      setContractAddress(networkAddress);
    }
  }, [networkAddress]);

  const pushLog = useCallback((message) => {
    setEventLogs((prev) => [message, ...prev].slice(0, 15));
  }, []);

  const resetStatus = useCallback((message, isError = false) => {
    setStatus(message);
    setStatusError(isError);
  }, []);

  const getRpcProvider = useCallback(
    (customUrl) => new ethers.JsonRpcProvider(customUrl || RPC_URL),
    []
  );

  const checkChainId = useCallback(
    async (activeProvider) => {
      const net = await activeProvider.getNetwork();
      const chainId = BigInt(net.chainId);
      if (chainId !== EXPECTED_CHAIN_ID) {
        resetStatus(`当前链 ID = ${chainId}，请切换到 ${EXPECTED_CHAIN_ID}`, true);
        return false;
      }
      return true;
    },
    [resetStatus]
  );

  const initContract = useCallback(
    async (activeProvider, activeSigner) => {
      const address = (contractAddress || "").match(/0x[a-fA-F0-9]{40}/)?.[0] || "";
      if (!ethers.isAddress(address)) {
        resetStatus("请输入合法的合约地址", true);
        setContract(null);
        return;
      }
      const chainOk = await checkChainId(activeProvider);
      if (!chainOk) return;

      const instance = new ethers.Contract(address, artifact.abi, activeSigner || activeProvider);
      setContract(instance);
      resetStatus("合约已连接，状态同步中…");
    },
    [contractAddress, checkChainId, resetStatus]
  );

  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      resetStatus("未检测到 MetaMask", true);
      return;
    }
    if (isConnecting) {
      resetStatus("连接请求已发送，请在 MetaMask 中确认", true);
      return;
    }
    setIsConnecting(true);
    try {
      await window.ethereum.request({ method: "eth_requestAccounts" });
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const browserSigner = await browserProvider.getSigner();
      const address = await browserSigner.getAddress();
      setProvider(browserProvider);
      setSigner(browserSigner);
      setAccount(address);
      resetStatus("钱包连接成功");
      await initContract(browserProvider, browserSigner);
    } catch (err) {
      resetStatus(`连接钱包失败：${err.message}`, true);
    } finally {
      setIsConnecting(false);
    }
  }, [initContract, isConnecting, resetStatus]);

  const switchChain = useCallback(
    async (chainIdHex) => {
      setSelectedChain(chainIdHex);
      if (!window.ethereum) {
        resetStatus("未检测到 MetaMask", true);
        return;
      }
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: chainIdHex }]
        });
      } catch (err) {
        if (err.code === 4902 && chainIdHex === "0x1691") {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x1691",
                chainName: "Ganache 5777",
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: [RPC_URL]
              }
            ]
          });
        } else if (err.code === 4902 && chainIdHex === "0x539") {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: "0x539",
                chainName: "Ganache 1337",
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: [RPC_URL]
              }
            ]
          });
        } else {
          resetStatus(`切链失败：${err.message}`, true);
        }
      }
    },
    [resetStatus]
  );

  const refreshState = useCallback(async () => {
    if (!contract) return;
    try {
      const [countValue, balanceValue, isEqualValue, roundIdValue] = await Promise.all([
        contract.count(),
        contract.getBalance(),
        contract.isEqual(),
        contract.roundId()
      ]);
      const countBig = BigInt(countValue);
      setCount(countBig.toString());
      setBalance(`${formatEth(balanceValue)} ETH`);
      setIsEqual(isEqualValue ? "等额" : "随机");
      setRoundId(BigInt(roundIdValue).toString());

      if (countBig === 0n) {
        const roundValue = BigInt(roundIdValue);
        if (roundValue === 0n) {
          setGrabHint("还没有人发红包");
        } else {
          setGrabHint("红包已抢完");
        }
        setGrabDisabled(true);
        return;
      }
      if (account) {
        const grabbed = await contract.grabbedRound(account);
        if (BigInt(grabbed) === BigInt(roundIdValue)) {
          setGrabHint("你已经抢过本轮红包");
          setGrabDisabled(true);
        } else {
          setGrabHint("可以抢红包");
          setGrabDisabled(false);
        }
      }
    } catch (err) {
      resetStatus(`同步失败：${err.message}`, true);
    }
  }, [account, contract, resetStatus]);

  const attachEvents = useCallback(() => {
    if (!contract) return;
    contract.removeAllListeners();

    contract.on("PacketCreated", (_sender, amountValue, countValue, equalValue, roundValue) => {
      const label = equalValue ? "等额" : "随机";
      pushLog(`新红包：${formatEth(amountValue)} ETH / ${countValue.toString()} 份 / ${label}`);
      refreshState();
    });

    contract.on("PacketGrabbed", (sender, amountValue, roundValue) => {
      const isSelf = account && sender.toLowerCase() === account.toLowerCase();
      const label = isSelf ? `${sender}（你）` : sender;
      pushLog(`${label} 抢到 ${formatEth(amountValue)} ETH（轮次 ${roundValue.toString()}）`);
      refreshState();
    });
  }, [account, contract, pushLog, refreshState]);

  const loadEventHistory = useCallback(async () => {
    if (!contract) return;
    try {
      const createdEvents = await contract.queryFilter("PacketCreated", 0, "latest");
      const grabbedEvents = await contract.queryFilter("PacketGrabbed", 0, "latest");
      const allEvents = [...createdEvents, ...grabbedEvents].sort(
        (a, b) => (a.blockNumber || 0) - (b.blockNumber || 0)
      );
      const lines = allEvents.slice(-30).map((event) => {
        if (event.eventName === "PacketCreated") {
          const [, amountValue, countValue, equalValue] = event.args || [];
          const label = equalValue ? "等额" : "随机";
          return `新红包：${formatEth(amountValue)} ETH / ${countValue.toString()} 份 / ${label}`;
        }
        if (event.eventName === "PacketGrabbed") {
          const [sender, amountValue, roundValue] = event.args || [];
          const isSelf = account && sender.toLowerCase() === account.toLowerCase();
          const label = isSelf ? `${sender}（你）` : sender;
          return `${label} 抢到 ${formatEth(amountValue)} ETH（轮次 ${roundValue.toString()}）`;
        }
        return "";
      });
      setEventLogs(lines.filter(Boolean));
    } catch (err) {
      resetStatus(`事件读取失败：${err.message}`, true);
    }
  }, [account, contract, resetStatus]);

  useEffect(() => {
    const rpcProvider = getRpcProvider(rpcUrl);
    setProvider(rpcProvider);
    initContract(rpcProvider, null);
  }, [getRpcProvider, initContract, rpcUrl]);

  useEffect(() => {
    if (!contract) return;
    attachEvents();
    loadEventHistory();
    refreshState();
    const timer = setInterval(refreshState, 15000);
    return () => clearInterval(timer);
  }, [attachEvents, contract, loadEventHistory, refreshState]);

  useEffect(() => {
    if (!window.ethereum) return;
    const handleAccounts = () => connectWallet();
    const handleChain = () => window.location.reload();
    window.ethereum.on("accountsChanged", handleAccounts);
    window.ethereum.on("chainChanged", handleChain);
    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccounts);
      window.ethereum.removeListener("chainChanged", handleChain);
    };
  }, [connectWallet]);

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    if (!contract || !signer) {
      resetStatus("请先连接钱包", true);
      return;
    }

    const amount = createForm.amount.trim();
    const countInput = createForm.count.trim();
    if (!amount || !countInput) {
      resetStatus("金额和数量不能为空", true);
      return;
    }

    const weiAmount = ethers.parseEther(amount);
    if (weiAmount <= 0n) {
      resetStatus("金额必须大于 0", true);
      return;
    }

    const countValue = BigInt(countInput);
    if (countValue <= 0n) {
      resetStatus("红包数量必须大于 0", true);
      return;
    }

    if (weiAmount < countValue) {
      resetStatus("总金额需 >= 红包数量（最小 1 wei/份）", true);
      return;
    }

    try {
      const tx = await contract.createRedPacket(countInput, createForm.isEqual, { value: weiAmount });
      resetStatus("等待发红包交易确认…");
      await tx.wait();
      resetStatus("红包创建成功");
    } catch (err) {
      resetStatus(`发红包失败：${err.data?.message || err.message}`, true);
    }
  };

  const handleGrab = async () => {
    if (!contract || !signer) {
      resetStatus("请先连接钱包", true);
      return;
    }
    try {
      const tx = await contract.grabRedPacket();
      resetStatus("正在抢红包…");
      await tx.wait();
      resetStatus("抢红包成功");
    } catch (err) {
      resetStatus(`抢红包失败：${err.data?.message || err.message}`, true);
    }
  };

  return (
    <div className="page">
      <TopBar
        account={account}
        onConnect={connectWallet}
        onSwitchChain={switchChain}
        selectedChain={selectedChain}
      />

      <main>
        <section className="card">
          <h2>合约配置（读取 RedPacket.json）</h2>
          <div className="grid">
            <div>
              <label htmlFor="contract-address">合约地址</label>
              <input
                id="contract-address"
                value={contractAddress}
                onChange={(event) => setContractAddress(event.target.value)}
                placeholder="0x..."
              />
            </div>
            <div>
              <label htmlFor="rpc-url">RPC 地址</label>
              <input id="rpc-url" value={rpcUrl} onChange={(event) => setRpcUrl(event.target.value)} />
            </div>
          </div>
          <div className={`status ${statusError ? "error" : ""}`}>{status}</div>
        </section>

        <section className="card">
          <h2>发红包</h2>
          <form onSubmit={handleCreateSubmit} className="grid-form">
            <div>
              <label htmlFor="amount">总金额（ETH）</label>
              <input
                id="amount"
                type="number"
                step="0.0001"
                min="0"
                value={createForm.amount}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    amount: event.target.value
                  }))
                }
              />
            </div>
            <div>
              <label htmlFor="count">红包数量</label>
              <input
                id="count"
                type="number"
                step="1"
                min="1"
                value={createForm.count}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    count: event.target.value
                  }))
                }
              />
            </div>
            <div>
              <label htmlFor="equal-mode">分发方式</label>
              <select
                id="equal-mode"
                value={createForm.isEqual ? "true" : "false"}
                onChange={(event) =>
                  setCreateForm((prev) => ({
                    ...prev,
                    isEqual: event.target.value === "true"
                  }))
                }
              >
                <option value="true">等额</option>
                <option value="false">随机</option>
              </select>
            </div>
            <button className="primary" type="submit">
              发红包
            </button>
          </form>
        </section>

        <section className="card">
          <h2>抢红包</h2>
          <p className="status">{grabHint}</p>
          <button className="primary" type="button" onClick={handleGrab} disabled={grabDisabled}>
            抢一个红包
          </button>
        </section>

        <section className="card">
          <h2>当前状态</h2>
          <div className="info-grid">
            <div className="info-box">
              <strong>剩余份数</strong>
              <p>{count}</p>
            </div>
            <div className="info-box">
              <strong>当前余额</strong>
              <p>{balance}</p>
            </div>
            <div className="info-box">
              <strong>等额模式</strong>
              <p>{isEqual}</p>
            </div>
            <div className="info-box">
              <strong>轮次 ID</strong>
              <p>{roundId}</p>
            </div>
          </div>
          <div className="status">
            事件日志
            <ul className="log">
              {eventLogs.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
