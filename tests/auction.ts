
import { setTimeout as sleep } from 'timers/promises'
import chai, { assert, expect } from 'chai'
import chaiAsPromised from 'chai-as-promised';
import * as anchor from '@project-serum/anchor'
import { AnchorError, Program } from '@project-serum/anchor'
import { Auction } from '../target/types/auction'
import { airdropFn, pdaFn, bidSeed, speedCheck } from './utils'

chai.use(chaiAsPromised)

const INITIAL_PRICE = 100
const AUCTION_LENGTH = 60

const STRUCT_SIZE_OFFER = 17

let _price = INITIAL_PRICE
const getPrice = (jump: number = 0) => _price += jump

describe('auction', () => {
  // Use local cluster
  const provider = anchor.Provider.local(undefined, { commitment: 'confirmed' })
  anchor.setProvider(provider)

  // Reference to the auction program
  const program = anchor.workspace.Auction as Program<Auction>

  // Init util functions
  const airdrop = airdropFn(provider)
  const pda = pdaFn(program.programId)

  // Initialize humans
  const initializer = anchor.web3.Keypair.generate()
  const bidder1 = anchor.web3.Keypair.generate()
  const bidder2 = anchor.web3.Keypair.generate()

  it('Airdropped to humans', async () => {
    await airdrop(initializer.publicKey)
    await airdrop(bidder1.publicKey)
    await airdrop(bidder2.publicKey)
  })

  // Init accounts for the initialize function
  const state = anchor.web3.Keypair.generate()
  const treasury = anchor.web3.Keypair.generate()

  // This will be the starting time of the auction
  let timeStart: Date;

  it('Program is initialized', async () => {
    const tx = await program.methods
      .initialize(new anchor.BN(AUCTION_LENGTH), new anchor.BN(INITIAL_PRICE))
      .accounts({
        initializer: initializer.publicKey,
        state: state.publicKey,
        treasury: treasury.publicKey,
      })
      .signers([initializer, state, treasury])
      .rpc()

    timeStart = new Date()

    await provider.connection.confirmTransaction(tx)

  })

  it('Cant place bid lower than the inital price', async () => {
    speedCheck(timeStart, AUCTION_LENGTH)

    const [_pda, _bump] = await pda(bidSeed(state.publicKey, bidder1.publicKey))

    try {
      await program.methods
        .bid(new anchor.BN(INITIAL_PRICE - 1))
        .accounts({
          state: state.publicKey,
          treasury: treasury.publicKey,
          buyer: bidder1.publicKey,
          offer: _pda
        })
        .signers([bidder1])
        .rpc()

      assert(false)
    } catch (e) {
      const err = e as AnchorError
      expect(err.error.errorCode.code).to.equal('BidTooLow')
    }
  })

  it('Cant place same as the inital price', async () => {
    speedCheck(timeStart, AUCTION_LENGTH)

    const currentBidder = bidder1;
    const [_pda, _bump] = await pda(bidSeed(state.publicKey, currentBidder.publicKey))

    try {
      await program.methods
        .bid(new anchor.BN(INITIAL_PRICE))
        .accounts({
          state: state.publicKey,
          treasury: treasury.publicKey,
          buyer: currentBidder.publicKey,
          offer: _pda
        })
        .signers([currentBidder])
        .rpc()

      assert(false)
    } catch (e) {
      const err = e as AnchorError
      expect(err.error.errorCode.code).to.equal('BidTooLow')
    }
  })

  let bidFirstAmount: number;
  it('Place 1st bid', async () => {
    speedCheck(timeStart, AUCTION_LENGTH)

    const currentBidder = bidder1;
    const [_pda, _bump] = await pda(bidSeed(state.publicKey, currentBidder.publicKey))
    bidFirstAmount = getPrice(10);

    const balanceBefore = await provider.connection.getBalance(currentBidder.publicKey)

    const rent = await provider.connection.getMinimumBalanceForRentExemption(STRUCT_SIZE_OFFER)
    const tx = await program.methods
      .bid(new anchor.BN(bidFirstAmount))
      .accounts({
        state: state.publicKey,
        treasury: treasury.publicKey,
        buyer: currentBidder.publicKey,
        offer: _pda
      })
      .signers([currentBidder])
      .rpc()

    await provider.connection.confirmTransaction(tx)

    const balanceAfter = await provider.connection.getBalance(currentBidder.publicKey)
    expect(balanceBefore - balanceAfter - rent).to.be.equal(bidFirstAmount)
  })

  it('Dont allow increasing an existing bid for the highest bidder', async () => {
    speedCheck(timeStart, AUCTION_LENGTH)

    const currentBidder = bidder1;
    const [_pda, _bump] = await pda(bidSeed(state.publicKey, currentBidder.publicKey))

    try {
      await program.methods
        .bid(new anchor.BN(getPrice() + 10))
        .accounts({
          state: state.publicKey,
          treasury: treasury.publicKey,
          buyer: currentBidder.publicKey,
          offer: _pda
        })
        .signers([currentBidder])
        .rpc()

      assert(false)
    } catch (e) {
      const err = e as AnchorError
      expect(err.error.errorCode.code).to.equal('AlreadyHighestBidder')
    }
  })

  it('Dont allow lowballing the highest bid', async () => {
    speedCheck(timeStart, AUCTION_LENGTH)

    const currentBidder = bidder2;
    const [_pda, _bump] = await pda(bidSeed(state.publicKey, currentBidder.publicKey))

    try {
      await program.methods
        .bid(new anchor.BN(getPrice() - 1))
        .accounts({
          state: state.publicKey,
          treasury: treasury.publicKey,
          buyer: currentBidder.publicKey,
          offer: _pda
        })
        .signers([currentBidder])
        .rpc()

      assert(false)
    } catch (e) {
      const err = e as AnchorError
      expect(err.error.errorCode.code).to.equal('BidTooLow')
    }
  })

  let bidPenultimate: anchor.web3.PublicKey, bidderPenultimate: anchor.web3.Keypair, bidPenultimateAmount: number;
  it('Place 2nd bid', async () => {
    speedCheck(timeStart, AUCTION_LENGTH)

    const currentBidder = bidder2;
    const [_pda, _bump] = await pda(bidSeed(state.publicKey, currentBidder.publicKey))
    bidPenultimate = _pda, bidderPenultimate = currentBidder, bidPenultimateAmount = getPrice(10);

    const balanceBefore = await provider.connection.getBalance(currentBidder.publicKey)

    const rent = await provider.connection.getMinimumBalanceForRentExemption(STRUCT_SIZE_OFFER)
    const tx = await program.methods
      .bid(new anchor.BN(bidPenultimateAmount))
      .accounts({
        state: state.publicKey,
        treasury: treasury.publicKey,
        buyer: currentBidder.publicKey,
        offer: _pda
      })
      .signers([currentBidder])
      .rpc()

    await provider.connection.confirmTransaction(tx)

    const balanceAfter = await provider.connection.getBalance(currentBidder.publicKey)
    expect(balanceBefore - balanceAfter - rent).to.be.equal(bidPenultimateAmount)
  })

  let bidHighest: anchor.web3.PublicKey, bidderHighest: anchor.web3.Keypair, bidHighestAmount: number;
  it('Place 3rd bid - upgrade 1st one', async () => {
    speedCheck(timeStart, AUCTION_LENGTH)

    const currentBidder = bidder1;
    const [_pda, _bump] = await pda(bidSeed(state.publicKey, currentBidder.publicKey))
    bidHighest = _pda, bidderHighest = currentBidder, bidHighestAmount = getPrice(10);

    const balanceBefore = await provider.connection.getBalance(currentBidder.publicKey)

    const tx = await program.methods
      .bid(new anchor.BN(bidHighestAmount))
      .accounts({
        state: state.publicKey,
        treasury: treasury.publicKey,
        buyer: currentBidder.publicKey,
        offer: _pda
      })
      .signers([currentBidder])
      .rpc()

    await provider.connection.confirmTransaction(tx)

    const balanceAfter = await provider.connection.getBalance(currentBidder.publicKey)
    expect(balanceBefore - balanceAfter).to.be.equal(bidHighestAmount - bidFirstAmount)
  })

  it('Dont allow closing the auction before the end', async () => {
    speedCheck(timeStart, AUCTION_LENGTH)

    try {
      await program.methods
        .endAuction()
        .accounts({
          state: state.publicKey,
          treasury: treasury.publicKey,
          initializer: initializer.publicKey,
          maxBidder: bidderHighest.publicKey
        })
        .signers([initializer])
        .rpc()

      assert(false)
    } catch (e) {
      const err = e as AnchorError
      expect(err.error.errorCode.code).to.equal('Open')
    }
  })

  it('Dont allow refunding a bid before the end', async () => {
    speedCheck(timeStart, AUCTION_LENGTH)

    try {
      await program.methods
        .refund()
        .accounts({
          state: state.publicKey,
          treasury: treasury.publicKey,
          buyer: bidderPenultimate.publicKey,
          offer: bidPenultimate
        })
        .signers([bidderPenultimate])
        .rpc()

      assert(false)
    } catch (e) {
      const err = e as AnchorError
      expect(err.error.errorCode.code).to.equal('Open')
    }
  })

  it('Waiting for auction end', async () => {
    const endTime = +timeStart + (AUCTION_LENGTH * 1000)
    const now = +new Date()

    if (endTime >= now)
      await sleep((endTime - now) + 1000)
  })

  it('Dont allow refunding a bid before the close', async () => {
    try {
      await program.methods
        .refund()
        .accounts({
          state: state.publicKey,
          treasury: treasury.publicKey,
          buyer: bidderPenultimate.publicKey,
          offer: bidPenultimate
        })
        .signers([bidderPenultimate])
        .rpc()

      assert(false)
    } catch (e) {
      const err = e as AnchorError
      expect(err.error.errorCode.code).to.equal('Open')
    }
  })

  it('Dont allow close by a third party', async () => {
    try {
      await program.methods
        .endAuction()
        .accounts({
          state: state.publicKey,
          treasury: treasury.publicKey,
          initializer: bidder1.publicKey,
          maxBidder: bidderHighest.publicKey
        })
        .signers([bidder1])
        .rpc()

      assert(false)
    } catch (e) {
      const err = e as AnchorError
      expect(err.error.errorCode.code).to.equal('WrongAccount')
    }
  })

  it('Close the auction', async () => {
    const balanceBefore = await provider.connection.getBalance(initializer.publicKey)

    const tx = await program.methods
      .endAuction()
      .accounts({
        state: state.publicKey,
        treasury: treasury.publicKey,
        initializer: initializer.publicKey,
        maxBidder: bidderHighest.publicKey
      })
      .signers([initializer])
      .rpc()

    await provider.connection.confirmTransaction(tx)

    const balanceAfter = await provider.connection.getBalance(initializer.publicKey)

    expect(balanceAfter - balanceBefore).to.be.equal(getPrice())
  })

  it('Dont allow double close', async () => {
    try {
      await program.methods
        .endAuction()
        .accounts({
          state: state.publicKey,
          treasury: treasury.publicKey,
          initializer: initializer.publicKey,
          maxBidder: bidderHighest.publicKey
        })
        .signers([initializer])
        .rpc()

      assert(false)
    } catch (e) {
      const err = e as AnchorError
      expect(err.error.errorCode.code).to.equal('Open')
    }
  })

  it('Refund non-winner', async () => {
    const currentBidder = bidderPenultimate;
    const balanceBefore = await provider.connection.getBalance(currentBidder.publicKey)

    const rent = await provider.connection.getMinimumBalanceForRentExemption(STRUCT_SIZE_OFFER)
    const tx = await program.methods
      .refund()
      .accounts({
        state: state.publicKey,
        treasury: treasury.publicKey,
        buyer: currentBidder.publicKey,
        offer: bidPenultimate
      })
      .signers([currentBidder])
      .rpc()

    await provider.connection.confirmTransaction(tx)

    const balanceAfter = await provider.connection.getBalance(currentBidder.publicKey)

    // The rent will be refunded too
    expect(balanceAfter - balanceBefore).to.be.equal(bidPenultimateAmount + rent)
  })

  it('Dont allow double refund', async () => {
    try {
      await program.methods
        .refund()
        .accounts({
          state: state.publicKey,
          treasury: treasury.publicKey,
          buyer: bidderPenultimate.publicKey,
          offer: bidPenultimate
        })
        .signers([bidderPenultimate])
        .rpc()

      assert(false)
    } catch (e) {
      const err = e as AnchorError
      expect(err.error.errorCode.code).to.equal('AccountNotInitialized')
    }
  })

})
