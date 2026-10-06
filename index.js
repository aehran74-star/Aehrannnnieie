const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {setGlobalOptions}=require('firebase-functions/v2');
const {defineSecret}=require('firebase-functions/params');
const admin=require('firebase-admin');
const crypto=require('crypto');
const Razorpay=require('razorpay');
const GST=require('../gst.js');

admin.initializeApp();
setGlobalOptions({region:'asia-southeast1',maxInstances:10});
const db=admin.database();
const RAZORPAY_KEY_ID=defineSecret('RAZORPAY_KEY_ID');
const RAZORPAY_KEY_SECRET=defineSecret('RAZORPAY_KEY_SECRET');
const ROOT='aehran_store_v3';
const clean=v=>v==null?'':String(v).trim();
const arr=v=>Array.isArray(v)?v.filter(Boolean):(v&&typeof v==='object'?Object.values(v).filter(Boolean):[]);
const safe=v=>String(v||'').replace(/[.#$\[\]/]/g,'_');
const round2=GST.round2;

function getProducts(v){return arr(v)}
function findProduct(products,id){return products.find(p=>String(p.id)===String(id))||null}
function normalizeCart(cart,products){
  if(!Array.isArray(cart)||!cart.length)throw new HttpsError('invalid-argument','Cart is empty.');
  return cart.map(raw=>{
    const p=findProduct(products,raw?.id);
    if(!p)throw new HttpsError('failed-precondition',`Product ${clean(raw?.id)||'unknown'} is no longer available.`);
    const qty=Math.max(1,Math.min(99,Math.floor(Number(raw?.qty)||1)));
    if(Number(p.stock||0)<qty)throw new HttpsError('failed-precondition',`${p.name||'Product'} does not have enough stock.`);
    return {id:p.id,name:p.name||'Product',sku:p.sku||p.id,qty,size:clean(raw?.size),color:clean(raw?.color)||clean(p.color),fatherSize:clean(raw?.fatherSize),sonSize:clean(raw?.sonSize),isCombo:!!p.isCombo,price:Math.max(0,Number(p.price)||0),old:Math.max(0,Number(p.old||p.price)||0),hsnSac:clean(p.hsnSac||p.hsn||p.sac)};
  });
}
function discountRule(cms,code){return (Array.isArray(cms?.discounts)?cms.discounts:[]).find(d=>d.active!==false&&String(d.code||'').toUpperCase()===String(code||'').toUpperCase())||null}
function buildCalculation({cms,cart,paymentMethod,customerState,couponCode=''}){
  const settings=GST.normalize(cms?.gstSettings||{});
  const sub=round2(cart.reduce((s,x)=>s+x.price*x.qty,0));
  let couponDiscount=0;const code=clean(couponCode).toUpperCase();
  const rule=discountRule(cms,code);
  if(code){if(!rule||sub<Number(rule.min||0))throw new HttpsError('failed-precondition','Coupon is invalid or its minimum value is not met.');couponDiscount=rule.type==='percent'?sub*Number(rule.value||0)/100:Number(rule.value||0);if(Number(rule.max||0)>0)couponDiscount=Math.min(couponDiscount,Number(rule.max));}
  const offer=cms?.productOffers||{},bundle=offer.bundle||{},prepaid=offer.prepaid||{};const qty=cart.reduce((s,x)=>s+x.qty,0);
  let bundleDiscount=0,bundlePercent=0;if(offer.enabled!==false&&bundle.enabled!==false){if(qty>=Number(bundle.buy3Qty||3))bundlePercent=Number(bundle.buy3Percent||15);else if(qty>=Number(bundle.buy2Qty||2))bundlePercent=Number(bundle.buy2Percent||10);bundleDiscount=sub*bundlePercent/100;}
  const isCod=/\bcod\b|cash on delivery/i.test(clean(paymentMethod));
  const prepaidDiscount=offer.enabled!==false&&prepaid.enabled!==false&&!isCod?sub*Number(prepaid.percent||5)/100:0;
  const totalDiscount=round2(Math.min(sub,couponDiscount+bundleDiscount+prepaidDiscount));
  let result=GST.calculateCart(cart,settings,totalDiscount,settings.businessState,customerState);
  const shippingAmount=Math.max(0,Number(cms?.checkout?.shippingAmount)||0);
  result=GST.withShipping(result,shippingAmount);
  return {...result,coupon:couponDiscount,bundle:round2(bundleDiscount),bundlePercent,prepaid:round2(prepaidDiscount),prepaidPercent:prepaidDiscount&&!isCod?Number(prepaid.percent||5):0,couponCode:rule?rule.code:null,shippingAmount,grandTotal:round2(result.grandTotal),sellerGSTIN:settings.gstin||'',sellerState:settings.businessState||'',gstMode:settings.mode};
}
async function loadStore(){const snap=await db.ref(ROOT).once('value');return snap.exists()?snap.val()||{}:{};}
function customerSnapshot(data){const c=data?.customer||{};return {name:clean(c.name),email:clean(c.email).toLowerCase(),phone:clean(c.phone).replace(/\D/g,''),address:clean(c.address),city:clean(c.city),state:clean(c.state),pincode:clean(c.pincode),addressType:clean(c.addressType||'Home')};}
function makeOrder({data,cart,calc,payment,paymentMeta={},orderId}){
  const c=customerSnapshot(data),date=new Date().toISOString();
  const invoiceNo=`INV-${String(Date.now()).slice(-8)}`;
  const items=cart.map((x,i)=>{const tax=calc.items?.[i]||{};return {id:x.id,name:x.name,sku:x.sku,qty:x.qty,size:x.size,color:x.color,fatherSize:x.fatherSize,sonSize:x.sonSize,isCombo:x.isCombo,price:x.price,old:x.old,hsnSac:x.hsnSac,taxableAmount:tax.taxableAmount||0,lineDiscount:tax.lineDiscount||0,gstRate:tax.gstRate||0,gstAmount:tax.gstAmount||0,cgstAmount:tax.cgstAmount||0,sgstAmount:tax.sgstAmount||0,igstAmount:tax.igstAmount||0};});
  return {id:orderId||`AHR${Math.floor(100000+Math.random()*900000)}`,invoiceNo,invoiceDate:date,date,name:c.name,email:c.email,phone:c.phone,address:[c.address,c.city,c.state,c.pincode].filter(Boolean).join(', '),shipping_address:{name:c.name,address:c.address,city:c.city,state:c.state,pincode:c.pincode},customerState:c.state,sellerState:calc.sellerState,sellerGSTIN:calc.sellerGSTIN,gstEnabled:calc.gstEnabled,gstMode:calc.gstMode,gstRate:calc.gstRate,gstAmount:calc.gstAmount,cgstRate:calc.cgstRate,sgstRate:calc.sgstRate,igstRate:calc.igstRate,cgstAmount:calc.cgstAmount,sgstAmount:calc.sgstAmount,igstAmount:calc.igstAmount,taxType:calc.taxType,subtotal:calc.subtotal,discount:round2(calc.discount),coupon:calc.couponCode||null,couponDiscount:calc.coupon,taxableAmount:calc.taxableAmount,shippingAmount:calc.shippingAmount,grandTotal:calc.grandTotal,total:calc.grandTotal,payment:payment||'COD',status:'Placed',items,...paymentMeta,gstSnapshot:{enabled:calc.gstEnabled,mode:calc.gstMode,rate:calc.gstRate,amount:calc.gstAmount,cgstRate:calc.cgstRate,sgstRate:calc.sgstRate,igstRate:calc.igstRate,cgstAmount:calc.cgstAmount,sgstAmount:calc.sgstAmount,igstAmount:calc.igstAmount,sellerGSTIN:calc.sellerGSTIN,sellerState:calc.sellerState,customerState:calc.customerState,taxableAmount:calc.taxableAmount},createdAt:date};
}
async function writeOrder(order,products){
  const patch={};patch[`orders/${safe(order.id)}`]=order;
  for(const item of order.items||[]){const p=findProduct(products,item.id);if(p)patch[`products/${safe(p.id)}/stock`]=Math.max(0,(Number(p.stock)||0)-item.qty)}
  patch['meta/updatedAt']=Date.now();patch['meta/lastOrderId']=order.id;patch['meta/lastWriteSource']='secure-gst-order';
  await db.ref(ROOT).update(patch);
  return order;
}
function verifySignature(orderId,paymentId,signature,secret){const expected=crypto.createHmac('sha256',secret).update(`${orderId}|${paymentId}`).digest('hex');return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(String(signature||'')))}

exports.createRazorpayOrder=onCall({secrets:[RAZORPAY_KEY_ID,RAZORPAY_KEY_SECRET]},async request=>{
  const data=request.data||{};const store=await loadStore();const products=getProducts(store.products);const cms=store.cms||{};const cart=normalizeCart(data.cart,products);const customerState=clean(data.customer?.state);const paymentMethod=clean(data.paymentMethod||'Razorpay');const calc=buildCalculation({cms,cart,paymentMethod,customerState,couponCode:data.couponCode});
  if(calc.grandTotal<=0)throw new HttpsError('failed-precondition','Order total must be greater than zero.');
  const keyId=clean(RAZORPAY_KEY_ID.value()||cms.checkout?.gateway?.keyId);const secret=clean(RAZORPAY_KEY_SECRET.value());
  if(!keyId||!secret)throw new HttpsError('failed-precondition','Razorpay server credentials are not configured.');
  const rp=new Razorpay({key_id:keyId,key_secret:secret});
  const rpOrder=await rp.orders.create({amount:Math.round(calc.grandTotal*100),currency:'INR',receipt:`AHR-${Date.now()}`,notes:{source:'AEHRAN',gstRate:String(calc.gstRate??''),gstAmount:String(calc.gstAmount)}});
  return {keyId,orderId:rpOrder.id,amount:rpOrder.amount,currency:rpOrder.currency,calculation:calc};
});

exports.verifyRazorpayPayment=onCall({secrets:[RAZORPAY_KEY_SECRET,RAZORPAY_KEY_ID]},async request=>{
  const data=request.data||{};const rpOrderId=clean(data.razorpayOrderId),paymentId=clean(data.razorpayPaymentId),signature=clean(data.razorpaySignature);if(!rpOrderId||!paymentId||!signature)throw new HttpsError('invalid-argument','Incomplete Razorpay payment verification data.');
  const secret=clean(RAZORPAY_KEY_SECRET.value());if(!secret)throw new HttpsError('failed-precondition','Razorpay server credentials are not configured.');
  if(!verifySignature(rpOrderId,paymentId,signature,secret))throw new HttpsError('permission-denied','Payment signature verification failed.');
  const rp=new Razorpay({key_id:clean(RAZORPAY_KEY_ID.value()),key_secret:secret});
  const rpOrder=await rp.orders.fetch(rpOrderId);
  const store=await loadStore();const products=getProducts(store.products);const cms=store.cms||{};const cart=normalizeCart(data.cart,products);const customerState=clean(data.customer?.state);const calc=buildCalculation({cms,cart,paymentMethod:'Razorpay',customerState,couponCode:data.couponCode});
  if(Number(rpOrder.amount)!==Math.round(calc.grandTotal*100))throw new HttpsError('failed-precondition','Payment amount does not match the current server-side order calculation.');
  const order=makeOrder({data,cart,calc,payment:'Razorpay',paymentMeta:{razorpayOrderId:rpOrderId,razorpayPaymentId:paymentId,paymentStatus:'Captured'}});
  await writeOrder(order,products);return {ok:true,order};
});

exports.createCodOrder=onCall(async request=>{
  const data=request.data||{};const store=await loadStore();const products=getProducts(store.products);const cms=store.cms||{};const cart=normalizeCart(data.cart,products);const calc=buildCalculation({cms,cart,paymentMethod:'COD',customerState:clean(data.customer?.state),couponCode:data.couponCode});const order=makeOrder({data,cart,calc,payment:'COD',paymentMeta:{paymentStatus:'Pending / COD'}});await writeOrder(order,products);return {ok:true,order};
});
