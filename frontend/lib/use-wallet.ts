"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getWallets } from "@wallet-standard/app";
import type { IdentifierString, Wallet, WalletAccount } from "@wallet-standard/base";

export interface DetectedWallet {
  name: string;
  icon: string;
  readonly handle: unknown;
}

export interface WalletState {
  wallets: DetectedWallet[];
  connected: { name: string; address: string } | null;
  connecting: boolean;
  error: string | null;
  connect(w: DetectedWallet): Promise<void>;
  disconnect(): Promise<void>;
  signAndSend(transactionBase64: string): Promise<string>;
}

interface StandardConnectInput {
  readonly silent?: boolean;
}

interface StandardConnectOutput {
  readonly accounts: readonly WalletAccount[];
}

interface StandardConnectFeature {
  readonly version: "1.0.0";
  readonly connect: (input?: StandardConnectInput) => Promise<StandardConnectOutput>;
}

interface StandardDisconnectFeature {
  readonly version: "1.0.0";
  readonly disconnect: () => Promise<void>;
}

interface SolanaSignAndSendInput {
  readonly account: WalletAccount;
  readonly chain: IdentifierString;
  readonly transaction: Uint8Array;
}

interface SolanaSignAndSendOutput {
  readonly signature: Uint8Array;
}

interface SolanaSignAndSendFeature {
  readonly version: "1.0.0";
  readonly signAndSendTransaction: (
    ...inputs: readonly SolanaSignAndSendInput[]
  ) => Promise<readonly SolanaSignAndSendOutput[]>;
}

const BASE58_ALPHABET: string = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) {
    return "";
  }
  let zeroCount: number = 0;
  while (zeroCount < bytes.length && bytes[zeroCount] === 0) {
    zeroCount += 1;
  }
  if (zeroCount === bytes.length) {
    return "1".repeat(zeroCount);
  }
  const digits: number[] = [0];
  for (let i: number = zeroCount; i < bytes.length; i += 1) {
    let carry: number = bytes[i] as number;
    for (let j: number = 0; j < digits.length; j += 1) {
      const current: number = digits[j] as number;
      carry += current * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let encoded: string = "";
  for (let k: number = 0; k < zeroCount; k += 1) {
    encoded += "1";
  }
  for (let i: number = digits.length - 1; i >= 0; i -= 1) {
    const digit: number = digits[i] as number;
    encoded += BASE58_ALPHABET[digit] as string;
  }
  return encoded;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary: string = atob(base64);
  const bytes: Uint8Array = new Uint8Array(binary.length);
  for (let i: number = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function isSolanaChain(chain: IdentifierString): boolean {
  return chain.startsWith("solana:");
}

function qualifies(wallet: Wallet): boolean {
  const features: Readonly<Record<IdentifierString, unknown>> = wallet.features;
  if (!("standard:connect" in features)) {
    return false;
  }
  if (!("solana:signAndSendTransaction" in features)) {
    return false;
  }
  return wallet.chains.some(isSolanaChain);
}

function toDetected(wallet: Wallet): DetectedWallet {
  return {
    name: wallet.name,
    icon: wallet.icon,
    handle: wallet,
  };
}

// One connection per page. Every component that calls useWallet() (navbar, convert cards) must see the
// same session; per-hook state left the convert card disconnected after connecting in the navbar.
interface Session {
  wallet: Wallet | null;
  account: WalletAccount | null;
  connected: { name: string; address: string } | null;
}
let session: Session = { wallet: null, account: null, connected: null };
const listeners = new Set<(s: Session) => void>();
function publish(next: Session): void {
  session = next;
  listeners.forEach((l) => l(next));
}

export function useWallet(): WalletState {
  const [detected, setDetected] = useState<DetectedWallet[]>([]);
  const [connected, setConnectedState] = useState<{ name: string; address: string } | null>(session.connected);
  const [activeWallet, setActiveWalletState] = useState<Wallet | null>(session.wallet);
  const [activeAccount, setActiveAccountState] = useState<WalletAccount | null>(session.account);

  useEffect((): (() => void) => {
    const onSession = (s: Session): void => {
      setActiveWalletState(s.wallet);
      setActiveAccountState(s.account);
      setConnectedState(s.connected);
    };
    listeners.add(onSession);
    onSession(session);
    return (): void => {
      listeners.delete(onSession);
    };
  }, []);

  const setActiveWallet = (w: Wallet | null): void => publish({ ...session, wallet: w });
  const setActiveAccount = (a: WalletAccount | null): void => publish({ ...session, account: a });
  const setConnected = (c: { name: string; address: string } | null): void => publish({ ...session, connected: c });
  const [connecting, setConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect((): (() => void) => {
    const api = getWallets();
    const refresh = (): void => {
      const list: readonly Wallet[] = api.get();
      const next: DetectedWallet[] = list.filter(qualifies).map(toDetected);
      setDetected(next);
    };
    refresh();
    const offRegister: () => void = api.on("register", refresh);
    const offUnregister: () => void = api.on("unregister", refresh);
    return (): void => {
      offRegister();
      offUnregister();
    };
  }, []);

  const connect = useCallback(async (w: DetectedWallet): Promise<void> => {
    const wallet: Wallet = w.handle as Wallet;
    setConnecting(true);
    setError(null);
    try {
      const feature: StandardConnectFeature | undefined = wallet.features[
        "standard:connect"
      ] as unknown as StandardConnectFeature | undefined;
      if (!feature) {
        throw new Error("Wallet does not support standard:connect");
      }
      const output: StandardConnectOutput = await feature.connect();
      const account: WalletAccount | undefined = output.accounts.find(
        (candidate: WalletAccount): boolean => candidate.chains.some(isSolanaChain),
      );
      if (!account) {
        throw new Error("No Solana account found");
      }
      setActiveWallet(wallet);
      setActiveAccount(account);
      setConnected({ name: wallet.name, address: account.address });
    } catch (err) {
      const message: string = err instanceof Error ? err.message : "Failed to connect wallet";
      setActiveWallet(null);
      setActiveAccount(null);
      setConnected(null);
      setError(message);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async (): Promise<void> => {
    if (activeWallet !== null) {
      const feature: StandardDisconnectFeature | undefined = activeWallet.features[
        "standard:disconnect"
      ] as unknown as StandardDisconnectFeature | undefined;
      if (feature) {
        try {
          await feature.disconnect();
        } catch (err) {
          const message: string = err instanceof Error ? err.message : "Failed to disconnect wallet";
          setError(message);
        }
      }
    }
    setActiveWallet(null);
    setActiveAccount(null);
    setConnected(null);
  }, [activeWallet]);

  const signAndSend = useCallback(
    async (transactionBase64: string): Promise<string> => {
      if (activeWallet === null || activeAccount === null || connected === null) {
        throw new Error("Wallet not connected");
      }
      const feature: SolanaSignAndSendFeature | undefined = activeWallet.features[
        "solana:signAndSendTransaction"
      ] as unknown as SolanaSignAndSendFeature | undefined;
      if (!feature) {
        throw new Error("Wallet does not support solana:signAndSendTransaction");
      }
      const transaction: Uint8Array = base64ToBytes(transactionBase64);
      const account: WalletAccount = activeAccount;
      const chain: IdentifierString = "solana:mainnet";
      const outputs: readonly SolanaSignAndSendOutput[] = await feature.signAndSendTransaction({
        account,
        chain,
        transaction,
      });
      const first: SolanaSignAndSendOutput | undefined = outputs[0];
      if (!first) {
        throw new Error("Wallet returned no signature");
      }
      return base58Encode(first.signature);
    },
    [activeWallet, activeAccount, connected],
  );

  return useMemo(
    (): WalletState => ({
      wallets: detected,
      connected,
      connecting,
      error,
      connect,
      disconnect,
      signAndSend,
    }),
    [detected, connected, connecting, error, connect, disconnect, signAndSend],
  );
}
