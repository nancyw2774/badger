/* configure access to our .env */
require("dotenv").config();

/* include express.js */
const express = require("express");
const bodyParser = require("body-parser");
const router = express.Router();
const app = express();
const port = 3000;
const { v4: uuidv4 } = require("uuid");

//db functions
const createDbClient = require("./db.js").createDbClient;
const addBadge = require("./db.js").addBadge;
const addUser = require("./db.js").addUser;
const getUser = require("./db.js").getUser;
const updateUserBadges = require("./db.js").updateUserBadges;
const retryTxn = require("./db.js").retryTxn;

/* hedera.js */
const {
    AccountId,
    PrivateKey,
    Client,
    TokenId,
    TokenCreateTransaction,
    TokenType,
    TokenSupplyType,
    TokenMintTransaction,
    TransferTransaction,
    AccountBalanceQuery,
    TokenAssociateTransaction
} = require("@hashgraph/sdk");

// Configure accounts and client, and generate needed keys
const operatorId = AccountId.fromString(process.env.OPERATOR_ID);
const operatorKey = PrivateKey.fromString(process.env.OPERATOR_PV_KEY);
const treasuryId = AccountId.fromString(process.env.TREASURY_ID);
const treasuryKey = PrivateKey.fromString(process.env.TREASURY_PV_KEY);
const supplyKey = PrivateKey.generate();

const hederaClient = Client.forTestnet().setOperator(operatorId, operatorKey);
var dbClient;

// configure express to user body-parser as middleware
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());


app.on('listening', async () => {
    dbClient = createDbClient();
});

app.get('/testDB', (req,res)=>{
    //gatherEventInfo();
    // dbClient =  createDbClient();
    // // console.log(dbClient);
    // const name = "jane doe"
    // const symbol = "MB"
    // const cid = "Qmc7rh6UsAvJfxt51mkpXpPBGAfmZQxw75BMcU19LeF9DA";

    // console.log("create badge")
    // const tId =  createBadge("Muffin Badge", symbol, 50);

    // //store badge in db
    // var badgeVals = [uuidv4(), tId.toString(), symbol];
    // retryTxn(0, 15, dbClient, addBadge, badgeVals);

    // //get user details from db
    // const rows = retryTxn(0, 15, dbClient, getUser, [name]);
    // const txAccountId = AccountId.fromString(rows[0].account_id);
    // const txAccountKey = PrivateKey.fromString(rows[0].account_key);
    // const accountBadges = rows[0].badges;
    
    // //mint and assign badge
    // mintBadge([cid], tId);
    // assignBadge(txAccountId, txAccountKey, tId);

    // //add new badge to user
    // accountBadges.push(tId.toString());
    // retryTxn(0, 15, dbClient, updateUserBadges, [accountBadges, name]);

    console.log(req);
    console.log(`working`);
    res.status(200);
    res.send();
    // console.log(`${badgeName}`);
});

app.post('/testDB2', (req,res)=>{
    // let badgeName = req.body.badgeName;
    // console.log(`${badgeName}`);
    console.log(req.body);
    console.log(`working`);
    res.status(200);
    res.send();
    //gatherBadgeInfo();
});

router.post('/create-user', async (req, res) => {
    // get request body fields
    const name = req.body.name;
    const id = req.body.id;
    const key = req.body.key;

    //add user to db
    var userVals = [uuidv4(), id, key, name];
    console.log("adding user...");
    await retryTxn(0, 15, dbClient, addUser, userVals);

    res.status(200)
    res.send('added user')
})

app.post('/create-badge', async (req, res) => {
    dbClient = await createDbClient();
    console.log(req.body);
    // get request body fields
    const name = req.body.name;
    const symbol = req.body.symbol;
    const max = req.body.max;

    const tokenId = await createBadge(name, symbol, max);

    //store badge in db
    console.log("add badge...");
    var badgeVals = [uuidv4(), tokenId.toString(), symbol];
    await retryTxn(0, 15, dbClient, addBadge, badgeVals);

    res.status(200)
    res.send('created badge')
})

router.post('/assign-badge', async (req, res) => {
    // get request body fields
    const CID = req.body.cid;
    const tokenId = TokenId.fromString(req.body.tokenId);
    const txAccountName = req.body.username;

    //get user details from db
    console.log("get user...");
    const rows = await retryTxn(0, 15, dbClient, getUser, [txAccountName]);
    const txAccountId = AccountId.fromString(rows[0].account_id);
    const txAccountKey = PrivateKey.fromString(rows[0].account_key);
    const accountBadges = rows[0].badges;

    try {
        //assign badge to user
        await mintBadge(CID, tokenId);
        await assignBadge(txAccountId,txAccountKey,tokenId)

        //add new badge to user
        console.log("update badges...");
        accountBadges.push(tokenId.toString());
        await retryTxn(0, 15, dbClient, updateUserBadges, [accountBadges, txAccountName]);

        res.status(200)
        res.send('assigned badge')
    }
    catch (err){
        console.log(err)
        res.status(500)
        res.send('ERR: unable to assign badge')
    }
})

app.listen(port, () => {
    console.log(`Badger listening at http://localhost:${port}`)
})

// Creating badge based on info supplied by the event organizer
async function createBadge(name,symbol,max) {
    //Creating the NFT
    let badgeCreate = await new TokenCreateTransaction()
        .setTokenName(name)
        .setTokenSymbol(symbol)
        .setTokenType(TokenType.NonFungibleUnique)
        .setDecimals(0)
        .setInitialSupply(0)
        .setTreasuryAccountId(treasuryId) //maybe get treasury key from organizer?
		.setSupplyType(TokenSupplyType.Finite)
        .setMaxSupply(max)
        .setSupplyKey(supplyKey) //check what the supply key should be
        .freezeWith(hederaClient);

    //Sign the transaction and submit to network
    let badgeCreateTxSign = await badgeCreate.sign(treasuryKey);
    let badgeCreateSubmit = await badgeCreateTxSign.execute(hederaClient);

    //Get the transaction receipt information
    let badgeCreateRx = await badgeCreateSubmit.getReceipt(hederaClient);
    let tokenId = badgeCreateRx.tokenId;
    console.log(`- Created NFT with Token ID: ${tokenId} \n`);

    // Check treasury account balance
    let treasuryBal = await getAccountBalance(treasuryId, tokenId);
    console.log(`Treasury Account Balance: ${treasuryBal} NFTs of ID ${tokenId}`);

    return tokenId;
}

//Minting badge
async function mintBadge(CID, tokenId) {
    let mintTx = await new TokenMintTransaction()
        .setTokenId(tokenId)
        .setMetadata([Buffer.from(CID)])
        .freezeWith(hederaClient);
    
    //Sign the transaction and submit to network
    let mintTxSign = await mintTx.sign(supplyKey);
    let mintTxSubmit = await mintTxSign.execute(hederaClient);

    //Get the transaction receipt information (serial number)
    let mintRx = await mintTxSubmit.getReceipt(hederaClient);
    console.log(`- Created NFT ${tokenId} with serial: ${mintRx.serials[0].low} \n`);

    // Check treasury account balance
    let treasuryBal = await getAccountBalance(treasuryId, tokenId);
    console.log(`Treasury Account Balance: ${treasuryBal} NFTs of ID ${tokenId}`);
}

//Assigning badge
async function assignBadge(txAccountId,txAccountKey,tokenId) {
    //Associate new account with badge
    let associateTx = await new TokenAssociateTransaction()
		.setAccountId(txAccountId)
		.setTokenIds([tokenId])
		.freezeWith(hederaClient)
		.sign(txAccountKey);

    let associateTxSubmit = await associateTx.execute(hederaClient);
    let associateRx = await associateTxSubmit.getReceipt(hederaClient);
    console.log(`- NFT association with txAccount: ${associateRx.status}\n`);

    //Transfer badge from treasury to txAccount
	let tokenTransferTx = await new TransferTransaction()
		.addNftTransfer(tokenId, 1, treasuryId, txAccountId)
		.freezeWith(hederaClient)
		.sign(treasuryKey);
    let tokenTransferSubmit = await tokenTransferTx.execute(hederaClient);
    let tokenTransferRx = await tokenTransferSubmit.getReceipt(hederaClient);
    console.log(`\n- NFT transfer from Treasury to txAccount: ${tokenTransferRx.status} \n`);

    // Check treasury account and txAccount balance
    let treasuryBal = await getAccountBalance(treasuryId, tokenId);
    let txAccBal = await getAccountBalance(txAccountId, tokenId);
    console.log(`Treasury Account Balance: ${treasuryBal} NFTs of ID ${tokenId}`);
    console.log(`TxAccount Balance: ${txAccBal} NFTs of ID ${tokenId}\n`);
}

//Get account balance
async function getAccountBalance(accountId, tokenId) {
    var balanceCheckTx = await new AccountBalanceQuery().setAccountId(accountId).execute(hederaClient);
    var balance = balanceCheckTx.tokens._map.get(tokenId.toString())
	// console.log(`- Balance: ${balance} NFTs of ID ${tokenId}`);
    return balance
}



async function main() {
    dbClient = await createDbClient();
    // console.log(dbClient);
    const name = "jane doe"
    const symbol = "MB"
    const cid = "Qmc7rh6UsAvJfxt51mkpXpPBGAfmZQxw75BMcU19LeF9DA";

    console.log("create badge")
    const tId = await createBadge("Muffin Badge", symbol, 50);

    //store badge in db
    var badgeVals = [uuidv4(), tId.toString(), symbol];
    await retryTxn(0, 15, dbClient, addBadge, badgeVals);

    //get user details from db
    const rows = await retryTxn(0, 15, dbClient, getUser, [name]);
    const txAccountId = AccountId.fromString(rows[0].account_id);
    const txAccountKey = PrivateKey.fromString(rows[0].account_key);
    const accountBadges = rows[0].badges;
    
    //mint and assign badge
    mintBadge([cid], tId);
    assignBadge(txAccountId, txAccountKey, tId);

    //add new badge to user
    accountBadges.push(tId.toString());
    await retryTxn(0, 15, dbClient, updateUserBadges, [accountBadges, name]);
}


// main();