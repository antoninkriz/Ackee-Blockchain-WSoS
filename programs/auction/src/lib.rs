use anchor_lang::{
    prelude::*,
    solana_program::clock::UnixTimestamp,
};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod auction {
    use super::*;
    /// Creates and initialize a new state of our program
    pub fn initialize(ctx: Context<Initialize>, auction_duration: UnixTimestamp, /* optional parameters */) -> Result<()> {
        // ...
        Ok(())
    }
    /// Bid
    pub fn bid(ctx: Context<Initialize>) -> Result<()> {
        // ...
        Ok(())
    }
    /// After an auction ends (determined by `auction_duration`), a seller can claim the
    /// heighest bid by calling this instruction
    pub fn end_auction(ctx: Context<Initialize>) -> Result<()> {
        // ...
        Ok(())
    }
    /// After an auction ends (the initializer/seller already received the winning bid), 
    /// the unsuccessfull bidders can claim their money back by calling this instruction
    pub fn refund(ctx: Context<Initialize>) -> Result<()> {
        // ...
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    /// State of our auction program (up to you)
    // #[account(...)]
    pub state: Account<'info, State>,
    /// Account which holds tokens bidded by biders
    // #[account(...)]
    pub treasury: AccountInfo<'info>,
    /// Seller
    // #[account(...)]
    pub initializer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct State {
    // ...
}
