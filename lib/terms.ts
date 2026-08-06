// Foodlab Ltd — Standard Terms and Conditions of Supply
// Source: "Foodlab Ltd - Standard Terms and Conditions of Supply (Final - June 2026).docx"

export const TERMS_VERSION = '3 June 2026'
export const TERMS_TITLE = 'Foodlab Ltd — Standard Terms and Conditions of Supply'

export interface TermsSection {
  heading: string
  paragraphs: string[]
}

export const TERMS_PREAMBLE = [
  'Foodlab Ltd — Registered in England and Wales (Company No. 16280477). 167-169 Great Portland Street, Fifth Floor, London, England, W1W 5PF. Version dated: 3 June 2026.',
  'IMPORTANT — ACCEPTANCE OF THESE TERMS: By placing an Order with Foodlab, the Customer confirms that it has read, understood, and agrees to be bound by these Terms and Conditions. These Terms apply to every Order unless a Separate Payment Arrangement or other written agreement signed by both parties expressly overrides them. No other terms (including any terms submitted by the Customer) shall apply unless agreed in writing by a director of Foodlab.',
]

export const TERMS_SECTIONS: TermsSection[] = [
  {
    heading: '1. Interpretation',
    paragraphs: [
      '1.1 In these Terms and Conditions, the following definitions apply:',
      '1.1.1 "Alcoholic Products" means any product supplied by Foodlab that contains alcohol, including cocktail mixes, pre-batched cocktails, spirits-infused syrups, or any other beverages or food products with an alcoholic content above 0.5% ABV;',
      '1.1.2 "Applicable Law" means all statutes, regulations, regulatory requirements, codes of practice, and guidance having the force of law applicable in any part of the United Kingdom from time to time, including (without limitation) the Food Safety Act 1990, the Food Information Regulations 2014, the Food Hygiene (England) Regulations 2006, the Licensing Act 2003, the Alcohol Wholesaler Registration Scheme requirements administered by HMRC, the Bribery Act 2010, the Modern Slavery Act 2015, the UK GDPR, and the Data Protection Act 2018;',
      '1.1.3 "Confidential Information" means any information of a confidential or proprietary nature disclosed by one party to the other in connection with this Agreement, including formulations, recipes, production processes, pricing, customer lists, Development Briefs, trade secrets, and business plans, whether disclosed orally, in writing, or by any other means;',
      '1.1.4 "Customer" means the business entity that places an Order with Foodlab;',
      '1.1.5 "Customer Materials" means any ingredients, components, raw materials, packaging, or other inputs provided by the Customer to Foodlab for use in manufacturing the Products;',
      '1.1.6 "Development Brief" means the written document agreed between the parties before commencement of Development Services, specifying the scope, objectives, deliverables, fee, revision rounds, and any agreed milestones;',
      '1.1.7 "Development IP" means all intellectual property rights (including formulations, recipes, manufacturing processes, product concepts, trade secrets, and know-how) created or developed by Foodlab in the course of providing Development Services, whether or not incorporating Customer input or Customer Materials;',
      '1.1.8 "Development Services" means the research and development and product customisation services provided by Foodlab to the Customer, as described in the applicable Development Brief;',
      '1.1.9 "Foodlab" means Foodlab Ltd, a private limited company incorporated in England and Wales with company number 16280477, whose registered office is at 167-169 Great Portland Street, Fifth Floor, London, England, W1W 5PF, trading as "Foodlab";',
      '1.1.10 "Force Majeure Event" means any circumstance beyond a party\'s reasonable control, including acts of God, natural disaster, pandemic or public health emergency, war, terrorism, civil unrest, strike or industrial action (whether affecting that party\'s own workforce or that of a supplier), ingredient or raw material shortage, failure of a third-party supplier, government action, regulatory change, port congestion, or extreme weather conditions;',
      '1.1.11 "Order" means a written purchase order or written request submitted by the Customer to Foodlab through Foodlab\'s Noory ordering platform (or, for Customers who are not onboarded onto Noory, through a unique portal link issued by Foodlab) or such other ordering method as Foodlab may make available from time to time, for the supply of Products or Development Services;',
      '1.1.12 "Order Confirmation" means Foodlab\'s written acceptance of an Order (including acceptance issued via Foodlab\'s online ordering platform or by email), which constitutes the binding formation of a contract between the parties on these Terms;',
      '1.1.13 "Products" means all food, drink, and related products manufactured and/or supplied by Foodlab, including (without limitation) cocktail mixes, syrups, lollipops, Alcoholic Products, and any other items specified in an Order Confirmation;',
      '1.1.14 "Product Specification" means the agreed written description of a Product, including ingredients, allergen information, packaging requirements, shelf life, storage conditions, and applicable quality standards;',
      '1.1.15 "Recall" means the withdrawal of Products from the supply chain or from consumers, whether initiated by Foodlab, the Customer, or a regulatory authority;',
      '1.1.16 "Separate Payment Arrangement" means any written agreement signed by authorised representatives of both parties that expressly varies or replaces the payment terms in clause 5; and',
      '1.1.17 "Third-Party Carrier" means any third-party logistics provider engaged to deliver Products on Foodlab\'s behalf.',
      '1.2 In these Terms, unless the context otherwise requires: (a) references to clauses are to clauses of these Terms; (b) the singular includes the plural and vice versa; (c) headings are for convenience only and do not affect interpretation; and (d) references to writing include email where expressly stated.',
    ],
  },
  {
    heading: '2. Basis of Contract',
    paragraphs: [
      '2.1 These Terms govern all Orders placed by the Customer and, together with the applicable Order Confirmation and any agreed Product Specification or Development Brief, form the entire agreement between the parties in respect of each Order ("Agreement").',
      '2.2 An Order constitutes an offer by the Customer to purchase Products or Development Services on these Terms. No contract is formed until Foodlab issues an Order Confirmation. Foodlab may decline any Order at its absolute discretion.',
      '2.3 By placing an Order, the Customer agrees to be bound by these Terms. These Terms are made available on Foodlab\'s website and are incorporated by reference into all quotations, invoices, and Order Confirmations. If the Customer places an Order by any means (including by email, by telephone, or via a link on an invoice), it accepts these Terms in full.',
      '2.4 Any terms and conditions submitted by the Customer (whether in a purchase order, framework agreement, or otherwise) shall not apply to any Order, except to the extent that Foodlab has expressly agreed to them in writing signed by a director of Foodlab.',
      '2.5 Quotations issued by Foodlab are invitations to treat only and are valid for thirty (30) days from the date of issue unless stated otherwise. Foodlab reserves the right to withdraw or amend a quotation at any time before an Order Confirmation is issued.',
    ],
  },
  {
    heading: '3. Orders',
    paragraphs: [
      '3.1 The ordering process for Products is as follows:',
      '3.1.1 the Customer submits an Order through Foodlab\'s Noory ordering platform (or, for Customers who are not onboarded onto Noory, through a unique portal link issued by Foodlab providing access to the platform) or such other ordering method as Foodlab may make available from time to time, providing the Product description and quantity, any agreed Product Specification reference, the required delivery date and delivery address, and any other information specified by Foodlab;',
      '3.1.2 Foodlab shall review the Order and, if it accepts the Order, shall issue an Order Confirmation to the Customer. Foodlab may decline any Order at its absolute discretion;',
      '3.1.3 following issue of the Order Confirmation, Foodlab shall commence production. Where Foodlab requires the Customer to pay a deposit in accordance with clause 5.1(b), Foodlab shall first issue a deposit invoice and production shall not commence until the deposit is received in cleared funds;',
      '3.1.4 upon completion of production and prior to or upon dispatch, Foodlab shall issue an invoice to the Customer for the total Order value (or, where a deposit has been paid, the balance of the Order value); and',
      '3.1.5 the invoice issued under clause 3.1(d) shall be payable in accordance with clause 5.1.',
      '3.2 Once an Order Confirmation has been issued, the Order is binding on the Customer. Cancellation or variation of an Order is subject to Foodlab\'s prior written consent, which may be withheld at Foodlab\'s discretion. Where Foodlab agrees to cancellation, the Customer shall reimburse Foodlab for all costs and commitments reasonably incurred up to the date of cancellation, including the cost of ingredients sourced, labour, and third-party commitments. Where a deposit has been paid, the deposit shall be non-refundable in such circumstances, subject to clause 5.2.',
      '3.3 Minimum order quantities may apply, as specified in Foodlab\'s current quotation or price list.',
      '3.4 Delivery dates stated in an Order Confirmation are estimates only. Time is not of the essence unless the parties have expressly agreed otherwise in writing.',
    ],
  },
  {
    heading: '4. Production',
    paragraphs: [
      '4.1 Foodlab shall manufacture Products in accordance with the agreed Product Specification and in compliance with Applicable Law, including relevant food safety and hygiene requirements under the Food Safety Act 1990 and the Food Hygiene (England) Regulations 2006.',
      '4.2 Foodlab reserves the right to make minor modifications to ingredients, processes, or packaging where necessary to comply with Applicable Law, to address ingredient availability issues, or to ensure product safety, provided that Foodlab notifies the Customer promptly and such modifications do not materially alter the nature or quality of the Product. Where material changes are required, Foodlab shall obtain the Customer\'s prior written consent.',
      '4.3 All production timelines communicated by Foodlab are estimates only. Foodlab shall not be liable for delays caused by circumstances beyond its reasonable control (including ingredient shortages, third-party supplier failures, or staffing or industrial disputes), subject always to the force majeure provisions in clause 15. Foodlab shall notify the Customer as soon as reasonably practicable of any anticipated delay and shall provide a revised estimated timeline.',
      '4.4 Where production is delayed due to ingredient or raw material shortages beyond Foodlab\'s reasonable control, Foodlab will use reasonable endeavours to source alternatives and notify the Customer. If no alternative is reasonably available, Foodlab shall notify the Customer, and either party may cancel the affected Order by written notice, in which case Foodlab shall refund any deposit paid for the affected Products, less any costs incurred by Foodlab prior to cancellation.',
      '4.5 Foodlab shall maintain batch production records and traceability documentation as required by the General Food Law (Assimilated Regulation (EC) No 178/2002) and the Food Safety Act 1990.',
      '4.6 Where the Customer provides a Development Brief or Product Specification, the Customer warrants that the brief and specification comply with Applicable Law and do not require Foodlab to use any ingredient, process, or claim that would breach any food safety, labelling, or regulatory requirement.',
    ],
  },
  {
    heading: '5. Price and Payment',
    paragraphs: [
      '5.1 Unless a Separate Payment Arrangement is in place, the following payment terms apply to Orders for Products:',
      '5.1.1 following Foodlab\'s acceptance of an Order, Foodlab shall commence production;',
      '5.1.2 Foodlab reserves the right, at its absolute discretion, to require the Customer to pay a deposit before production commences, payment of all or part of the Order value before dispatch, or both, including (without limitation) where the Customer is a new client, where the Customer is placing its first few Orders with Foodlab, where the Order value exceeds a threshold determined by Foodlab from time to time, or where Foodlab otherwise considers it commercially appropriate. Where Foodlab requires a deposit or pre-dispatch payment, the deposit percentage and payment timing shall be notified to the Customer in the Order Confirmation or the relevant invoice;',
      '5.1.3 upon completion of production and prior to or upon dispatch, Foodlab shall issue an invoice to the Customer for the total Order value (or, where a deposit has been paid, the balance of the Order value), in each case exclusive of VAT; and',
      '5.1.4 invoices issued under clause 5.1(c) shall be payable in full in cleared funds within fourteen (14) days of the date of delivery of the relevant Products, unless an alternative payment date is specified in the Order Confirmation or invoice.',
      '5.2 Where a deposit has been paid under clause 5.1(b), that deposit is non-refundable except where: (a) Foodlab cancels the Order due to a Force Majeure Event in accordance with clause 15.4; (b) the Products fail to meet the agreed Product Specification due to Foodlab\'s manufacturing defect; or (c) Applicable Law otherwise requires a refund.',
      '5.3 Development Services are invoiced and paid in accordance with clause 12.2. The payment terms in clause 5.1 do not apply to Development Services.',
      '5.4 All prices are exclusive of VAT and any other applicable taxes or duties, which shall be charged at the prevailing rate and paid by the Customer.',
      '5.5 If the Customer fails to pay any invoice by the due date, Foodlab shall be entitled to: (a) charge interest on the overdue amount at the rate of eight per cent (8%) per annum above the Bank of England base rate from time to time, in accordance with the Late Payment of Commercial Debts (Interest) Act 1998; (b) suspend production and/or delivery of any outstanding Orders until all overdue amounts (including accrued interest) are paid in full; and (c) require prepayment for any future Orders.',
      '5.6 Where the Customer supplies Customer Materials, Foodlab shall credit their agreed value against the relevant invoice (whether a deposit invoice or otherwise) at the amount specified in the Order Confirmation or otherwise agreed in writing. The Customer is responsible for ensuring that the agreed value is accurate.',
      '5.7 All invoices are payable in full without deduction or set-off within the period stated on the invoice, or if no period is stated, within fourteen (14) days of the invoice date.',
    ],
  },
  {
    heading: '6. Customer Materials',
    paragraphs: [
      '6.1 Where the Customer provides Customer Materials, the Customer warrants that: (a) the Customer Materials comply with all Applicable Law, including applicable food safety, hygiene, and labelling requirements; (b) the Customer has the right to supply the Customer Materials to Foodlab for use in the manufacture of the Products; (c) the Customer Materials do not infringe any third-party intellectual property rights; and (d) the Customer will provide Foodlab with accurate documentation relating to the Customer Materials, including allergen declarations, certificates of analysis, and safety data sheets where applicable.',
      '6.2 Foodlab shall take reasonable care of Customer Materials while they are in its possession. Foodlab\'s liability for loss of or damage to Customer Materials shall not exceed the lower of (i) the replacement cost of the Customer Materials, or (ii) the value of the Customer Materials as stated in the Order Confirmation or otherwise agreed in writing.',
      '6.3 Where Products fail to meet the Product Specification due to a defect in the Customer Materials (rather than Foodlab\'s manufacturing process), Foodlab shall not be liable for that failure. Foodlab shall notify the Customer promptly if it identifies or suspects a defect in Customer Materials and shall not be obliged to use defective materials without the Customer\'s written instruction.',
      '6.4 If Foodlab incurs additional costs as a result of defective or non-compliant Customer Materials, Foodlab may charge those costs to the Customer on production of reasonable supporting evidence.',
    ],
  },
  {
    heading: '7. Delivery and Risk',
    paragraphs: [
      '7.1 Foodlab may arrange delivery of Products directly or through a Third-Party Carrier at its discretion. Delivery will be made to the address specified in the Order Confirmation.',
      '7.2 Where Foodlab engages a Third-Party Carrier, Foodlab shall select a reputable carrier and shall ensure that Products are appropriately packaged and labelled. Foodlab shall not be responsible for delays, loss, or damage caused by the Third-Party Carrier, provided that Foodlab exercised reasonable care in selecting and instructing the carrier. Foodlab shall reasonably assist the Customer in pursuing any claim against the Third-Party Carrier and shall provide relevant documentation on request.',
      '7.3 Risk in the Products passes to the Customer upon delivery to the Customer\'s nominated address (or, where the Customer collects the Products, upon collection from Foodlab\'s premises).',
      '7.4 Title to the Products shall not pass to the Customer until Foodlab has received payment in full in cleared funds for all Products comprised in the relevant Order (and all other amounts outstanding at the date of delivery). Until title passes, the Customer shall hold the Products as bailee for Foodlab and shall not sell, transfer, pledge, or otherwise dispose of the Products.',
      '7.5 The Customer must inspect the Products on or immediately following delivery and must notify Foodlab in writing of any visible damage, shortage, or discrepancy within forty-eight (48) hours of delivery. Failure to notify Foodlab within this period shall constitute acceptance of the Products in respect of any matter that would have been apparent on reasonable inspection.',
      '7.6 Where Foodlab arranges storage of manufactured Products awaiting delivery, Foodlab shall store the Products in conditions appropriate to the Product Specification. If the Customer requests extended storage beyond the originally agreed delivery date, the parties shall agree storage terms in writing and any risk of deterioration during the extended storage period shall pass to the Customer from the date on which delivery was originally scheduled.',
      '7.7 If delivery is delayed by more than thirty (30) days beyond the estimated delivery date as a result of Foodlab\'s fault (and not due to a Force Majeure Event or the Customer\'s own act or omission), the Customer may cancel the affected Order by written notice and shall receive a refund of any deposit paid for that Order, less any reasonable costs incurred by Foodlab prior to the date of cancellation.',
    ],
  },
  {
    heading: '8. Quality, Testing and Shelf Life',
    paragraphs: [
      '8.1 Foodlab shall manufacture Products in accordance with the agreed Product Specification and shall carry out such quality control checks as are reasonable and customary before releasing Products for delivery.',
      '8.2 If pre-delivery testing reveals that a Product does not conform to the Product Specification, Foodlab shall notify the Customer promptly and shall use reasonable endeavours to remedy the non-conformance within a reasonable timeframe. Foodlab may, at its option, remake the Product, offer a substitute, or refund the deposit for the affected Product if the non-conformance cannot reasonably be remedied.',
      '8.3 If the Customer discovers a quality issue with the Products after delivery, the Customer must notify Foodlab in writing within five (5) Business Days of discovering the issue, providing reasonable details of the nature and extent of the non-conformance. Foodlab shall investigate and, where the non-conformance is attributable to a manufacturing defect or failure to comply with the Product Specification, shall offer an appropriate remedy consistent with clause 8.2.',
      '8.4 Foodlab shall not be liable for quality or shelf-life issues that arise as a result of: (a) defective or non-compliant Customer Materials; (b) improper storage, handling, or use of the Products by the Customer or its customers following delivery; or (c) changes made to the Products by the Customer or third parties after delivery.',
      '8.5 Each Product Specification shall include an expected shelf life from the date of production, calculated on the basis of proper storage and handling in the conditions specified in the Product Specification. Foodlab shall not be responsible for any reduction in shelf life caused by circumstances outside its control once the Products have been delivered.',
      '8.6 Foodlab shall provide allergen information for each Product in compliance with the Food Information Regulations 2014 (as amended, including the requirements commonly referred to as "Natasha\'s Law" in respect of pre-packed for direct sale food). The Customer is responsible for communicating accurate allergen information to its own end customers and for ensuring that this information is displayed in accordance with Applicable Law.',
    ],
  },
  {
    heading: '9. Product Recalls and Withdrawals',
    paragraphs: [
      '9.1 Foodlab operates a documented withdrawal and recall procedure in accordance with the Food Safety Act 1990 and Assimilated Regulation (EC) No 178/2002, as these apply in Great Britain.',
      '9.2 Where Foodlab identifies, or reasonably suspects, that any Products supplied are unsafe, non-compliant with Applicable Law, or otherwise present a risk to health, Foodlab shall: (a) notify the Customer immediately, providing batch and production details; (b) notify the Food Standards Agency and the relevant local authority as required by Applicable Law; (c) coordinate the withdrawal or recall of the affected Products in accordance with its recall procedure; and (d) cooperate with all reasonable requests from the Customer and regulatory authorities in connection with the recall.',
      '9.3 The Customer may also notify Foodlab if it reasonably believes that any Products pose a health risk or fail to comply with the Product Specification. Foodlab shall investigate all such notifications promptly and shall take appropriate action in accordance with its recall procedure.',
      '9.4 The reasonable and documented direct costs of a Recall shall be borne as follows: (a) where the Recall arises from Foodlab\'s manufacturing defect, failure to comply with the Product Specification, or Foodlab\'s breach of Applicable Law, Foodlab shall bear such costs (subject to the liability cap in clause 13); and (b) where the Recall arises from the Customer\'s own act or omission (including mishandling of the Products after delivery, incorrect instructions provided by the Customer, or use of defective Customer Materials), the Customer shall bear such costs.',
      '9.5 The Customer shall: (a) maintain adequate traceability records to enable the identification and recovery of affected Products; (b) cooperate fully with Foodlab and regulatory authorities in any Recall; and (c) not dispose of or destroy recalled Products without Foodlab\'s prior written consent, unless required to do so by a regulatory authority.',
      '9.6 Costs of a Recall shall exclude indirect or consequential losses, which are excluded in accordance with clause 13.',
    ],
  },
  {
    heading: '10. Allergens and Allergen Information',
    paragraphs: [
      '10.1 Foodlab shall declare the presence of any of the 14 regulated food allergens (as set out in the Food Information Regulations 2014 and assimilated Regulation (EU) No 1169/2011) used as ingredients in the Products, and shall provide allergen information for each Product in the Product Specification in compliance with the Food Information Regulations 2014 (as amended, including the requirements commonly known as "Natasha\'s Law" in respect of pre-packed for direct sale food).',
      '10.2 The Customer warrants that all allergen declarations, certificates of analysis, ingredient information, and related documentation it provides to Foodlab in respect of Customer Materials are complete, accurate, and up to date, and shall notify Foodlab promptly in writing of any change. Foodlab shall be entitled to rely on such information in formulating, manufacturing, labelling, and supplying the Products.',
      '10.3 The Customer is responsible for accurately communicating all allergen information provided by Foodlab to its own customers and end consumers, and for ensuring that such information is displayed in accordance with Applicable Law. The Customer shall not alter, repackage, or relabel the Products in any way that renders the allergen information inaccurate, incomplete, or misleading without Foodlab\'s prior written consent.',
      '10.4 Where Foodlab applies precautionary allergen labelling (such as "may contain" statements), it shall do so on the basis of a risk assessment and in accordance with Food Standards Agency best-practice guidance, specifying the relevant allergen(s). Precautionary allergen labelling identifies a risk of unintentional allergen cross-contact and does not constitute a "free from" guarantee in respect of any allergen.',
      '10.5 Foodlab shall not be liable for any loss, claim, cost, or liability arising from: (a) incomplete, inaccurate, or out-of-date allergen information or Customer Materials supplied by the Customer; (b) the Customer\'s failure to communicate allergen information accurately to its customers or end consumers; or (c) any alteration, repackaging, or relabelling of the Products by the Customer or any third party after delivery.',
      '10.6 The Customer shall indemnify Foodlab against all losses, claims, costs, and liabilities arising from any breach of this clause.',
    ],
  },
  {
    heading: '11. Alcoholic Products',
    paragraphs: [
      '11.1 The supply of Alcoholic Products is subject to compliance with the Licensing Act 2003, the Alcohol Wholesaler Registration Scheme ("AWRS") administered by HMRC, and all other Applicable Law relating to the production, labelling, and supply of alcohol in the United Kingdom.',
      '11.2 The Customer warrants that: (a) it holds all licences, permits, and registrations required by Applicable Law to purchase and resell or otherwise deal in Alcoholic Products in the United Kingdom, including (where applicable) a premises licence under the Licensing Act 2003 and AWRS approval; (b) it will verify that Foodlab holds any required AWRS approval before purchasing Alcoholic Products for resale, and shall check Foodlab\'s Unique Registration Number against the HMRC register; (c) it will not supply Alcoholic Products to any person under the age of eighteen (18); and (d) it will comply with all conditions attaching to its own licences and permits in connection with its purchase and onward sale of Alcoholic Products.',
      '11.3 The Customer shall indemnify Foodlab against all losses, claims, costs, and liabilities arising from the Customer\'s breach of the warranties in clause 10.2.',
      '11.4 Foodlab shall ensure that all Alcoholic Products are labelled in compliance with Applicable Law. Foodlab does not warrant that the Customer\'s own licence conditions will be satisfied by the purchase of Alcoholic Products from Foodlab, and the Customer remains solely responsible for its own licensing compliance.',
    ],
  },
  {
    heading: '12. Development Services and Intellectual Property',
    paragraphs: [
      '12.1 Where the Customer wishes to commission Development Services, both parties shall agree a Development Brief in writing before any development work commences.',
      '12.2 Development Services are subject to the following payment terms: (a) following agreement of the Development Brief, Foodlab shall issue an invoice to the Customer for a deposit of fifty per cent (50%) of the total Development Services fee (exclusive of VAT); (b) Foodlab shall not be obliged to commence any development work until the deposit invoice has been paid in full in cleared funds; (c) upon completion of the Development Services, Foodlab shall issue a further invoice to the Customer for the balance of the Development Services fee (exclusive of VAT); and (d) the completed formulation, recipe, or other development deliverable shall not be shared with or released to the Customer until the balance invoice has been paid in full in cleared funds.',
      '12.3 The Development Services fee includes up to three (3) revision rounds. For these purposes, a "revision round" means one consolidated set of changes or feedback provided by the Customer following presentation of a sample, formulation, or prototype. If the Customer requests further revision rounds beyond three, Foodlab shall be entitled to charge additional fees at a rate to be agreed in writing before the additional work commences.',
      '12.4 The Customer shall provide clear, consolidated feedback during each revision round. Requests that fall outside the scope of the agreed Development Brief shall require a written change order agreed by both parties before Foodlab is obliged to carry out additional work.',
      '12.5 All Development IP is and shall remain the exclusive property of Foodlab, regardless of any input, direction, or Customer Materials provided by the Customer during the development process. The Customer\'s involvement in the development process does not confer any ownership rights over the Development IP.',
      '12.6 Foodlab grants the Customer a non-exclusive, non-transferable licence to use the Development IP solely for the purpose of ordering and using the Products manufactured by Foodlab under the Agreement. The Customer may not sub-licence, assign, reverse-engineer, or otherwise reproduce the underlying formulation or process without Foodlab\'s prior written consent.',
      '12.7 Where the Customer wishes to have exclusivity over a specific formulation, recipe, or product developed by Foodlab, the parties shall enter into a separate written exclusivity agreement setting out the scope, territory, duration, and any conditions of the exclusivity. In the absence of such an agreement, Foodlab may freely develop and supply similar or identical products to other customers.',
      '12.8 All intellectual property rights in Foodlab\'s existing formulations, recipes, processes, trade marks, and trade secrets remain Foodlab\'s property. The Customer shall not use Foodlab\'s intellectual property (including any trade marks or branding) without Foodlab\'s prior written consent. Foodlab does not claim ownership of the Customer\'s own branding or creative direction supplied solely for the purpose of customising the packaging or labelling of the Products.',
      '12.9 The Customer warrants that any Customer Materials and any branding, designs, or content it supplies to Foodlab are its exclusive property or that it has the right to use and supply them, and that their use by Foodlab will not infringe any third-party intellectual property rights. The Customer shall indemnify Foodlab against all claims, losses, costs, and liabilities arising from any breach of this warranty.',
      '12.10 Completion of Development Services does not oblige either party to proceed with production. Any subsequent manufacturing Order shall be placed and accepted in accordance with these Terms.',
    ],
  },
  {
    heading: '13. Confidentiality',
    paragraphs: [
      '13.1 Each party shall keep the other\'s Confidential Information strictly confidential during the term of the Agreement and for a period of five (5) years thereafter and shall not use the other party\'s Confidential Information for any purpose other than performing its obligations or exercising its rights under the Agreement.',
      '13.2 Each party may disclose the other\'s Confidential Information only to those of its employees, officers, contractors, and professional advisers who need to know it for the purposes of the Agreement, provided that each such person is subject to confidentiality obligations at least as stringent as those in this clause.',
      '13.3 The obligations in clause 12.1 shall not apply to information that: (a) is or becomes publicly available other than as a result of the receiving party\'s breach of this clause; (b) was lawfully in the receiving party\'s possession before disclosure by the disclosing party; (c) is lawfully disclosed to the receiving party by a third party without restriction; or (d) is required to be disclosed by law, court order, or regulatory authority, provided that the receiving party gives the disclosing party as much prior written notice as reasonably practicable.',
      '13.4 The Customer acknowledges that Foodlab\'s formulations, recipes, production processes, pricing, and Development IP are core Confidential Information and trade secrets of Foodlab and agrees to take particular care to protect them.',
    ],
  },
  {
    heading: '14. Liability',
    paragraphs: [
      '14.1 Nothing in these Terms limits or excludes either party\'s liability for: (a) death or personal injury caused by that party\'s negligence; (b) fraud or fraudulent misrepresentation; or (c) any other liability that cannot be excluded or limited under Applicable Law.',
      '14.2 Subject to clause 13.1, Foodlab\'s total aggregate liability to the Customer arising out of or in connection with any individual Order (whether in contract, in civil liability, or otherwise) shall not exceed the total amount paid by the Customer to Foodlab for the Products or Development Services that are the subject of the relevant claim.',
      '14.3 Subject to clause 13.1, the Customer\'s total aggregate liability to Foodlab arising out of or in connection with any individual Order (whether in contract, in civil liability, or otherwise) shall not exceed the total amount paid or payable by the Customer to Foodlab for the Products or Development Services that are the subject of the relevant claim.',
      '14.4 Neither party shall be liable to the other for any: (a) loss of profit, revenue, or anticipated savings; (b) loss of business or business opportunity; (c) loss of goodwill or damage to reputation; or (d) any indirect or consequential loss or damage, in each case whether or not foreseeable and whether or not that party had been advised of the possibility of such loss or damage.',
      '14.5 Foodlab shall not be liable for any loss or damage arising from: (a) inaccurate or incomplete information or specifications supplied by the Customer; (b) defective or non-compliant Customer Materials; or (c) the Customer\'s failure to comply with storage, handling, or usage instructions provided by Foodlab.',
    ],
  },
  {
    heading: '15. Force Majeure',
    paragraphs: [
      '15.1 Neither party shall be in breach of the Agreement, or liable for any failure or delay in performance, to the extent that such failure or delay is caused by a Force Majeure Event, provided that the affected party: (a) notifies the other party in writing as soon as reasonably practicable after the Force Majeure Event begins, describing the event and its expected impact; (b) uses reasonable endeavours to mitigate the effects of the Force Majeure Event and to resume performance as soon as reasonably practicable; and (c) keeps the other party regularly updated as to the status of the Force Majeure Event.',
      '15.2 The parties\' respective obligations under the Agreement shall be suspended for the duration of the Force Majeure Event.',
      '15.3 Force majeure does not relieve the Customer of its obligation to pay for Products already delivered prior to the Force Majeure Event.',
      '15.4 If a Force Majeure Event affecting an Order continues for more than sixty (60) consecutive days, either party may terminate the affected Order by giving not less than fourteen (14) days\' written notice to the other. Upon such termination: (a) the parties shall negotiate in good faith as to the amounts owed by either party; and (b) Foodlab shall refund any deposit paid for the affected Order, less any costs reasonably incurred by Foodlab before the date of termination.',
    ],
  },
  {
    heading: '16. Data Protection',
    paragraphs: [
      '16.1 Each party shall comply with the UK GDPR and the Data Protection Act 2018 (as amended from time to time) in connection with any personal data processed under or in connection with the Agreement.',
      '16.2 Foodlab shall process the Customer\'s contact and business data only to the extent necessary to administer and perform the Agreement and shall handle such data in accordance with Foodlab\'s privacy notice as published on its website from time to time.',
    ],
  },
  {
    heading: '17. Termination',
    paragraphs: [
      '17.1 Foodlab may terminate the Agreement with immediate effect by written notice to the Customer if: (a) the Customer fails to pay any sum due under the Agreement within fourteen (14) days of the due date; (b) the Customer commits a material breach of the Agreement and, where the breach is capable of remedy, fails to remedy it within fourteen (14) days of receiving written notice from Foodlab requiring it to do so; or (c) the Customer becomes insolvent, enters administration, receivership, or liquidation, or enters into a voluntary arrangement with its creditors.',
      '17.2 On termination of the Agreement: (a) Foodlab shall be entitled to retain any deposit paid in respect of any uncompleted Order; (b) Foodlab may recover from the Customer all costs reasonably incurred up to the date of termination, including ingredient and material costs and any third-party commitments; (c) title to any Products manufactured but unpaid for shall remain with Foodlab; and (d) all accrued rights and liabilities of either party as at the date of termination shall survive termination.',
    ],
  },
  {
    heading: '18. General',
    paragraphs: [
      '18.1 Entire Agreement: The Agreement constitutes the entire agreement between the parties in respect of its subject matter and supersedes all prior representations, negotiations, and agreements relating to that subject matter, save that nothing in this clause shall limit liability for fraudulent misrepresentation.',
      '18.2 Variation: No variation of the Agreement (other than an update to these Terms made by Foodlab under clause 17.9) is effective unless made in writing and signed by authorised representatives of both parties.',
      '18.3 Assignment: The Customer may not assign, transfer, or sub-contract any of its rights or obligations under the Agreement without Foodlab\'s prior written consent. Foodlab may assign or sub-contract its obligations to any member of its corporate group or to a third-party supplier, provided that Foodlab remains responsible to the Customer for performance.',
      '18.4 Third Party Rights: A person who is not a party to the Agreement has no right to enforce any term of the Agreement under the Contracts (Rights of Third Parties) Act 1999.',
      '18.5 Notices: Any notice under the Agreement shall be in writing and shall be delivered or sent by pre-paid first-class post to the Customer\'s registered office (or last known business address) or to Foodlab\'s registered office as stated at the head of these Terms. Notices sent by pre-paid first-class post shall be deemed received forty-eight (48) hours after posting. Where both parties have expressly agreed to the use of email for notices, notices sent by email shall be deemed received at the time of transmission, provided no delivery failure notification is received.',
      '18.6 Waiver: No failure or delay by either party to exercise any right or remedy under the Agreement shall operate as a waiver of that right or remedy.',
      '18.7 Severance: If any provision of the Agreement is found to be invalid, unlawful, or unenforceable, that provision shall be deemed severed and the remaining provisions shall continue in full force and effect.',
      '18.8 Anti-Bribery and Modern Slavery: Each party shall comply with all Applicable Law relating to anti-bribery and corruption (including the Bribery Act 2010) and modern slavery (including section 54 of the Modern Slavery Act 2015 where applicable), and shall not engage in any activity, practice, or conduct that would constitute an offence under such legislation.',
      '18.9 Updates to These Terms: Foodlab reserves the right to update or amend these Terms at any time by publishing the revised version on its website. Any such update shall take effect from the date of publication and shall apply to all Orders placed after that date. Orders that have already been accepted by way of an Order Confirmation prior to the date of publication shall continue to be governed by the version of these Terms in force at the time the Order Confirmation was issued. The Customer is responsible for reviewing the current version of these Terms before placing each Order. By placing an Order after an update has been published, the Customer accepts the updated Terms in full.',
    ],
  },
  {
    heading: '19. Governing Law and Jurisdiction',
    paragraphs: [
      '19.1 The Agreement and any non-contractual obligations arising out of or in connection with it are governed by the law of England and Wales.',
      '19.2 The courts of England and Wales shall have exclusive jurisdiction to settle any dispute arising out of or in connection with the Agreement, save that either party may seek urgent injunctive or protective relief in any court of competent jurisdiction.',
    ],
  },
]

export const TERMS_FOOTER =
  'Foodlab Ltd | Company No. 16280477 | 167-169 Great Portland Street, Fifth Floor, London, England, W1W 5PF | These Terms were last updated on 3 June 2026'
