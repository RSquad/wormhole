/**
 * Deployment script for CommentIntegrator contract
 * 
 * Usage:
 *   node deploy-comment-integrator.js <network> <wormhole-address>
 * 
 * Example for devnet:
 *   node deploy-comment-integrator.js devnet 0xC89Ce4735882C9F0f0FE26686c53074E09B0D550
 */

const ethers = require('ethers');
const fs = require('fs');
const path = require('path');

// Wormhole Core addresses for different networks
const WORMHOLE_ADDRESSES = {
    devnet: '0xC89Ce4735882C9F0f0FE26686c53074E09B0D550',
    testnet: {
        ethereum: '0x0CBE91CF822c73C2315FB05100C2F714765d5c20',
        bsc: '0x68605AD7b15c732a30b1BbC62BE8F2A509D74b4D',
        polygon: '0x0CBE91CF822c73C2315FB05100C2F714765d5c20',
    },
    mainnet: {
        ethereum: '0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B',
        bsc: '0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B',
        polygon: '0x7A4B5a56256163F07b2C80A7cA55aBE66c4ec4d7',
    }
};

// RPC endpoints
const RPC_URLS = {
    devnet: 'http://localhost:8545',
    testnet: {
        ethereum: 'https://rpc.ankr.com/eth_goerli',
        bsc: 'https://data-seed-prebsc-1-s1.binance.org:8545',
        polygon: 'https://rpc-mumbai.maticvigil.com',
    }
};

// Ganache default private key (for devnet only!)
const DEVNET_PRIVATE_KEY = '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.error('Usage: node deploy-comment-integrator.js <network> [wormhole-address] [private-key]');
        console.error('Networks: devnet, testnet, mainnet');
        process.exit(1);
    }
    
    const network = args[0];
    let wormholeAddress = args[1];
    const privateKey = args[2] || (network === 'devnet' ? DEVNET_PRIVATE_KEY : process.env.PRIVATE_KEY);
    
    if (!privateKey) {
        console.error('Error: Private key not provided. Set PRIVATE_KEY env variable or pass as argument.');
        process.exit(1);
    }
    
    // Auto-detect wormhole address if not provided
    if (!wormholeAddress) {
        if (network === 'devnet') {
            wormholeAddress = WORMHOLE_ADDRESSES.devnet;
        } else {
            console.error('Error: Wormhole address must be provided for non-devnet networks');
            process.exit(1);
        }
    }
    
    const rpcUrl = network === 'devnet' ? RPC_URLS.devnet : process.env.RPC_URL;
    if (!rpcUrl) {
        console.error('Error: RPC URL not provided. Set RPC_URL env variable.');
        process.exit(1);
    }
    
    console.log('Deploying CommentIntegrator...');
    console.log(`Network: ${network}`);
    console.log(`RPC: ${rpcUrl}`);
    console.log(`Wormhole: ${wormholeAddress}`);
    
    // Load contract
    const contractPath = path.join(__dirname, 'CommentIntegrator.sol');
    const contractSource = fs.readFileSync(contractPath, 'utf8');
    
    // Note: This is a simplified deploy script
    // For production, use Hardhat or Foundry for compilation and deployment
    
    const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    console.log(`Deploying from: ${wallet.address}`);
    
    // Check balance
    const balance = await wallet.getBalance();
    console.log(`Balance: ${ethers.utils.formatEther(balance)} ETH`);
    
    if (balance.eq(0)) {
        console.error('Error: Wallet has no balance!');
        process.exit(1);
    }
    
    // For actual deployment, compile with solc or use hardhat/foundry
    console.log('\n⚠️  This is a template deployment script.');
    console.log('To deploy the contract, use one of the following methods:');
    console.log('\n1. Using Foundry:');
    console.log(`   forge create src/integrator/CommentIntegrator.sol:CommentIntegrator \\`);
    console.log(`     --rpc-url ${rpcUrl} \\`);
    console.log(`     --private-key ${privateKey.substring(0, 10)}... \\`);
    console.log(`     --constructor-args ${wormholeAddress}`);
    
    console.log('\n2. Using Hardhat:');
    console.log('   Add deployment script to scripts/deploy-comment-integrator.ts');
    console.log('   npx hardhat run scripts/deploy-comment-integrator.ts --network <network>');
    
    console.log('\n3. Manual deployment using Remix:');
    console.log(`   - Open ${contractPath} in Remix`);
    console.log(`   - Compile with solc 0.8.0+`);
    console.log(`   - Deploy with constructor arg: ${wormholeAddress}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });


