use anchor_lang::{
    prelude::*,
    solana_program::clock::UnixTimestamp,
};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod auction {
    use super::*;

    /// Creates and initialize a new state of our program
    pub fn initialize(ctx: Context<Auction>, auction_duration: UnixTimestamp, initial_price: u64) -> Result<()> {
        let state = &mut ctx.accounts.state;
        state.open = true;
        state.max_price = initial_price;
        state.max_bidder = *ctx.accounts.initializer.key;
        state.initializer = *ctx.accounts.initializer.key;
        state.treasury = *ctx.accounts.treasury.key;
        state.end_time = Clock::get()?.unix_timestamp + auction_duration;

        Ok(())
    }

    /// Bid
    pub fn bid(ctx: Context<Bid>) -> Result<()> {
        let state = &mut ctx.accounts.state;
        let buyer = &ctx.accounts.buyer;
        let treasury = &ctx.accounts.treasury;
        let offer = &ctx.accounts.offer;

        if offer.price <= state.max_price {
            return Err(error!(Errors::BidTooLow));
        }

        if Clock::get()?.unix_timestamp >= state.end_time {
            return Err(error!(Errors::Closed));
        }
        
        if state.max_bidder == *buyer.key {
            return Err(error!(Errors::AlreadyHighestBidder));
        }

        **buyer.try_borrow_mut_lamports()? -= offer.price;
        **treasury.try_borrow_mut_lamports()? += offer.price;

        state.max_price = offer.price;
        state.max_bidder = *buyer.key;

        Ok(())
    }

    /// After an auction ends (determined by `auction_duration`), a seller can claim the
    /// heighest bid by calling this instruction
    pub fn end_auction(ctx: Context<Finish>) -> Result<()> {
        let state = &mut ctx.accounts.state;

        if Clock::get()?.unix_timestamp < state.end_time {
            return Err(error!(Errors::Open));
        }

        Ok(())
    }

    /// After an auction ends (the initializer/seller already received the winning bid), 
    /// the unsuccessfull bidders can claim their money back by calling this instruction
    pub fn refund(ctx: Context<Auction>) -> Result<()> {
        // ...
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Auction<'info> {
    /// State of our auction program (up to you)
    #[account(
        init,
        payer = initializer,
        space = 8 + 42069
    )]
    pub state: Account<'info, State>,

    /// Account which holds tokens bidded by biders
    #[account(owner = initializer.key())]
    pub treasury: AccountInfo<'info>,

    /// Seller
    #[account(mut)]
    pub initializer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Bid<'info> {
    #[account(mut, has_one = treasury @ Errors::WrongOwner)]
    pub state: Account<'info, State>,

    #[account(address = state.treasury)]
    pub treasury: AccountInfo<'info>,
    
    #[account(
        init,
        payer = buyer,
        space = 8 + 42069,
        seeds = [b"bid", buyer.key().as_ref()],
        bump
    )]
    pub offer: Account<'info, Offer>,

    #[account(mut)]
    pub buyer: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Finish<'info> {
    #[account(mut, has_one = initializer @ Errors::WrongOwner)]
    pub state: Account<'info, State>,

    pub initializer: Signer<'info>,
}

#[account]
pub struct State {
    pub open: bool,
    pub max_price: u64,
    pub max_bidder: Pubkey,
    pub initializer: Pubkey,
    pub treasury: Pubkey,
    pub end_time: UnixTimestamp
}

#[account]
pub struct Offer {
    pub price: u64,
    pub treasury: Pubkey,
    pub buyer: Pubkey,
    pub bump: u8,
}

#[error_code]
pub enum Errors {
    #[msg("Bid offer too low.")]
    BidTooLow,

    #[msg("Already the highest bidder.")]
    AlreadyHighestBidder,

    #[msg("Wrong owner.")]
    WrongOwner,

    #[msg("Auction is closed.")]
    Closed,

    #[msg("Auction is open.")]
    Open,
}
