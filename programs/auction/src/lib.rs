use std::mem::size_of;

use anchor_lang::{
    prelude::*,
    solana_program::{
        clock::UnixTimestamp,
        program::invoke,
        system_instruction
    }
};

declare_id!("BMuqkhWcrVZpP5esxn7EnNfAe3V3CWxHj73KSsUJ53gL");

#[program]
pub mod auction {

    use super::*;

    /// Creates and initialize a new state of our program
    pub fn initialize(ctx: Context<Auction>, auction_duration: i64, initial_price: u64) -> Result<()> {
        let end_time = Clock::get()?.unix_timestamp.checked_add(auction_duration);
        if end_time == None {
            return Err(error!(Errors::InvalidOperation));
        }

        let x = Clock::get()?.unix_timestamp;
        msg!("{x}", x = x);

        let state = &mut ctx.accounts.state;
        state.initializer = *ctx.accounts.initializer.key;
        state.treasury = *ctx.accounts.treasury.key;
        state.max_bidder = Pubkey::default();
        state.max_price = initial_price;
        state.end_time = end_time.unwrap();
        state.open = true;

        Ok(())
    }

    /// Bid
    pub fn bid(ctx: Context<Bid>, amount: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let buyer = &mut ctx.accounts.buyer;

        // Is the auction still running?
        if Clock::get()?.unix_timestamp >= state.end_time {
            return Err(error!(Errors::Closed));
        }

        // Check if the bid is lower or equal compared to the current highest
        if amount <= state.max_price {
            return Err(error!(Errors::BidTooLow));
        }

        // Don't allow increasing the bid for the highest bidder
        if *buyer.key == state.max_bidder {
            return Err(error!(Errors::AlreadyHighestBidder));
        }

        // In a case this was not a new bid we have to calculate the difference between an old and a new amount bidded
        let offer = &mut ctx.accounts.offer;
        let diff = amount.checked_sub(offer.amount);
        if diff == None {
            return Err(error!(Errors::InvalidOperation))
        }

        // Move lamports to the treasury
        let treasury = &mut ctx.accounts.treasury;
        invoke(
            &system_instruction::transfer(
                buyer.key,
                treasury.key,
                diff.unwrap()
            ),
            &[
                buyer.to_account_info().clone(),
                treasury.clone()
            ]
        )?;

        // Update state with the new highest bidder and the new highest bid
        state.max_price = amount;
        state.max_bidder = *buyer.key;

        // Update the offer price
        let new_offer_price = offer.amount.checked_add(amount);
        if new_offer_price == None {
            return Err(error!(Errors::InvalidOperation))
        }

        // Update the offer for a possible refund
        offer.amount = new_offer_price.unwrap();
        offer.bump = *ctx.bumps.get("offer").unwrap();

        Ok(())
    }

    /// After an auction ends (determined by `auction_duration`), a seller can claim the
    /// heighest bid by calling this instruction
    pub fn end_auction(ctx: Context<Finish>) -> Result<()> {
        let state = &mut ctx.accounts.state;

        // Is the auction already closed?
        if Clock::get()?.unix_timestamp < state.end_time {
            return Err(error!(Errors::Open));
        }

        // Transfer lamports to the seller
        **ctx.accounts.treasury.try_borrow_mut_lamports()? -= state.max_price;
        **ctx.accounts.initializer.try_borrow_mut_lamports()? += state.max_price;

        // Close the auction
        state.open = false;

        Ok(())
    }

    /// After an auction ends (the initializer/seller already received the winning bid), 
    /// the unsuccessfull bidders can claim their money back by calling this instruction
    pub fn refund(ctx: Context<Refund>) -> Result<()> {
        let state = &ctx.accounts.state;

        // Is the auction already closed?
        if Clock::get()?.unix_timestamp < state.end_time {
            return Err(error!(Errors::Open));
        }

        // Transfer lamports back to the bidder
        let offer = &mut ctx.accounts.offer;
        **ctx.accounts.treasury.try_borrow_mut_lamports()? -= offer.amount;
        **ctx.accounts.buyer.try_borrow_mut_lamports()? += offer.amount;

        // Set the remaining amount of lamports to pay out to zero
        offer.amount = 0;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct Auction<'info> {
    #[account(
        init,
        payer = initializer,
        space = 8 + State::size()
    )]
    pub state: Account<'info, State>,

    /// CHECK:
    #[account(
        init,
        payer = initializer,
        space = 0
    )]
    pub treasury: AccountInfo<'info>,

    #[account(mut)]
    pub initializer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Bid<'info> {
    #[account(
        init_if_needed,
        payer = buyer,
        space = 8 + Offer::size(),
        seeds = [b"bid", state.key().as_ref(), buyer.key().as_ref()],
        bump,
    )]
    pub offer: Account<'info, Offer>,

    #[account(mut, has_one = treasury @ Errors::WrongAccount)]
    pub state: Account<'info, State>,

    /// CHECK:
    #[account(mut, address = state.treasury @ Errors::WrongAccount)]
    pub treasury: AccountInfo<'info>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Finish<'info> {
    #[account(
        mut,
        has_one = initializer @ Errors::WrongAccount,
        has_one = treasury @ Errors::WrongAccount,
        has_one = max_bidder @ Errors::WrongAccount,
        constraint = state.open @ Errors::Open
    )]
    pub state: Account<'info, State>,

    #[account(mut, address = state.initializer @ Errors::WrongAccount)]
    pub initializer: Signer<'info>,

    /// CHECK:
    #[account(mut, address = state.treasury @ Errors::WrongAccount)]
    pub treasury: AccountInfo<'info>,

    /// CHECK:
    #[account(mut, address = state.max_bidder @ Errors::WrongAccount)]
    pub max_bidder: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Refund<'info> {
    #[account(
        has_one = treasury @ Errors::WrongAccount,
        constraint = !state.open @ Errors::Open,
        constraint = state.max_bidder != *buyer.key @ Errors::WinnerRefund
    )]
    pub state: Account<'info, State>,

    /// CHECK:
    #[account(mut, address = state.treasury @ Errors::WrongAccount)]
    pub treasury: AccountInfo<'info>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        mut,
        seeds = [b"bid", state.key().as_ref(), buyer.key.as_ref()],
        bump = offer.bump,
        close = buyer
    )]
    pub offer: Account<'info, Offer>,

    pub system_program: Program<'info, System>,
}

#[account]
pub struct State {
    pub initializer: Pubkey,
    pub treasury: Pubkey,
    pub max_bidder: Pubkey,
    pub max_price: u64,
    pub end_time: i64,
    pub open: bool
}

impl State {
    pub fn size() -> usize {
        size_of::<Pubkey>() +
        size_of::<Pubkey>() +
        size_of::<Pubkey>() +
        size_of::<u64>() +
        size_of::<UnixTimestamp>() +
        size_of::<bool>()
    }
}

#[account]
pub struct Offer {
    pub amount: u64,
    pub bump: u8,
}

impl Offer {
    pub fn size() -> usize {
        size_of::<u64>() +
        size_of::<u8>() }
}

#[error_code]
pub enum Errors {
    #[msg("Bid offer too low")]
    BidTooLow,

    #[msg("Already the highest bidder")]
    AlreadyHighestBidder,

    #[msg("Wrong account")]
    WrongAccount,

    #[msg("Auction is open")]
    Open,

    #[msg("Auction is closed")]
    Closed,

    #[msg("Invalid operation")]
    InvalidOperation,

    #[msg("Winner can not refund")]
    WinnerRefund,
}
