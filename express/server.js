'use strict';
const express = require('express');
const path = require('path');
const serverless = require('serverless-http');
const app = express();
const bodyParser = require('body-parser');
require("dotenv").config()
const Web3Eth = require('web3-eth').Eth;
const Web3Utils = require('web3-utils');
const web3 = {eth: new Web3Eth(new Web3Eth.providers.HttpProvider("https://rpc.ftm.tools")), utils: Web3Utils};
const snapshot = require('../snapshot.json'); //This must be static after contract is created.
const abi = require('../abi.json'); //This must be static after contract is created.
const contractAddr = "0x598E1CEbB2a4b7f169EecbbdfcAB395438E6Ec27".toLowerCase();
const cors = require('cors');

const router = express.Router();
router.get('/', (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.write('<h1>Hello from Express.js!</h1>');
  res.end();
});
router.post('/maxBN', async (req, res) => {
  try {
    const json = req.body;
    const address = json.address.toLowerCase();
    const token = json.token.toLowerCase();
    return res.json({amount: (address in snapshot) && (token in snapshot[address]) ? web3.utils.toWei(`${snapshot[address][token]}`, 'ether').toString() : "0"});
  }
  catch (e)
  {
    console.log(e);
    return res.json({amount: "error"});
  }
});
router.post('/maxBNReduced', async (req, res) => {
  try {
    const json = req.body;
    const address = json.address.toLowerCase();
    const token = json.token.toLowerCase();
    const contract = new web3.eth.Contract(abi , contractAddr);
    const balance = await contract.methods.balanceOf(address, token).call(); //Get balance from web3. Should be safe to separate the two calls (as long as we get the nonce first) since it won't be signed or modified until we get both.
    return res.json({amount: (address in snapshot) && (token in snapshot[address]) ? web3.utils.toBN(web3.utils.toWei(`${snapshot[address][token]}`, 'ether')).sub(web3.utils.toBN(balance)).toString() : "0"});
  }
  catch (e)
  {
    console.log(e);
    return res.json({amount: "error"});
  }
});
router.post('/max', async (req, res) => {
  try {
    const json = req.body;
    const address = json.address.toLowerCase();
    const token = json.token.toLowerCase();
    return res.json({amount: (address in snapshot) && (token in snapshot[address]) ? snapshot[address][token] : 0});
  }
  catch (e)
  {
    console.log(e);
    return res.json({amount: "error"});
  }
});
router.post('/', async (req, res) => {
  //Check snapshot and see if amount is under max. If so, sign the message and send to the user. The client automatically inputs it into the smart contract and transfers.
  try {
    const json = req.body;
    const address = json.address.toLowerCase();
    const token = json.token.toLowerCase();
    const amount = json.amount;
    const contract = new web3.eth.Contract(abi , contractAddr);
    const nonce = await contract.methods.nonce(address).call(); //Get nonce from web3
    const balance = await contract.methods.balanceOf(address, token).call(); //Get balance from web3. Should be safe to separate the two calls (as long as we get the nonce first) since it won't be signed or modified until we get both.
    //On a desync, nonce would be the old value, and balance would be the new value, which would give the user a disadvantage and the signature wouldn't work anyways.
    let allowed = (address in snapshot) && (token in snapshot[address])
      && typeof amount == 'string' &&
      //Each have 18 decimals
      web3.utils.toBN(amount).lte(web3.utils.toBN(web3.utils.toWei(`${snapshot[address][token]}`, 'ether')).sub(web3.utils.toBN(balance))); //Convert snapshot to BN and subtract from amount already input.
    if(allowed) {
      const hash = web3.utils.soliditySha3(
        {t: "address", v: address},
        {t: "address", v: token},
        {t: "uint256", v: amount},
        {t: "uint256", v: nonce}, //Personal nonce to avoid subtraction avoidance.
        {t: "address", v: contractAddr}
      );
      const signer = web3.eth.accounts.sign(hash, process.env.PRIVATE_KEY);

      return res.json({hash: signer.message, signature: signer.signature});
    }
    return res.json({hash: "error", signature: "error"});
  }
  catch (e)
  {
    console.log(e);
    return res.json({hash: "error", signature: "error"});
  }
});

app.use(bodyParser.json());
app.use(cors());
app.use('/.netlify/functions/server', router);  // path must route to lambda
app.use('/', (req, res) => res.sendFile(path.join(__dirname, '../index.html')));

module.exports = app;
module.exports.handler = serverless(app);
