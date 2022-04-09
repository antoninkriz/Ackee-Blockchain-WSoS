import { TextEncoder } from 'util';
import * as anchor from '@project-serum/anchor'
import { assert } from 'chai';

const strToUInt8Array = (str: string) => new TextEncoder().encode(str)

export const airdropFn = (
  provider: anchor.Provider
) => async (
  pubKey: anchor.web3.PublicKey,
  amount: number = 1_000_000_000_000
) => await provider.connection.confirmTransaction(await provider.connection.requestAirdrop(pubKey, amount), 'confirmed')

export const pdaFn = (
  programId: anchor.web3.PublicKey
) => async (
  seeds: Uint8Array[]
) => await anchor.web3.PublicKey.findProgramAddress(seeds, programId)

export const bidSeed = (
  statePubKey: anchor.web3.PublicKey,
  bidderPubKey: anchor.web3.PublicKey
) => [strToUInt8Array('bid'), statePubKey.toBytes(), bidderPubKey.toBytes()]

export const speedCheck = (startTime: Date, duration: number, warningDelta: number = 3000) => {
  const endTime = (+startTime) + (duration * 1000)
  const now = +new Date()
  assert(endTime >= now, 'Time\'s out! Your duration is too slow. :( Maybe increase the auction time?')

  if (endTime - warningDelta < now)
    console.warn(`Time is running out! You have less than ${warningDelta} seconds before the end!`)
}
