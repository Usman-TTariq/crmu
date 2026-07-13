-- ============================================================================
-- TGT Nexus CRM — 06_demo_data.sql (OPTIONAL)
-- Sample pipeline data across every stage, for demos and testing.
-- Run after 05_seed.sql. Skips itself if the demo businesses already exist.
--
-- It drives the data through the real triggers: leads are inserted, then the
-- auto-created downstream records (QA -> SQL -> Closer -> OPS -> MSP ->
-- Fulfillment/Leasing -> Retention) are updated the same way the app would.
-- ============================================================================

do $$
declare
  l1 text; l2 text; l3 text; l4 text; l5 text; l6 text; l7 text;
  l8 text; l9 text; l10 text; l11 text; l12 text; l13 text; l14 text;
begin
  if exists (select 1 from public.leads where business_name = 'Bluebird Diner') then
    raise notice 'Demo data already present - skipping.';
    return;
  end if;

  -- -------------------------------------------------------------------------
  -- Leads (agent names match 05_seed.sql so leaderboards light up)
  -- -------------------------------------------------------------------------
  insert into public.leads (date_created, lead_gen_agent, lead_source, business_name, owner_name, phone, email, city, state, current_processor, monthly_volume, notes)
  values (current_date, 'Ezekiel Bhatti', 'Cold Calling', 'Bluebird Diner', 'Martha Reyes', '312-555-0141', 'martha@bluebirddiner.com', 'Chicago', 'IL', 'Square', 9500, 'Fresh lead, awaiting QA.')
  returning lead_id into l1;

  insert into public.leads (date_created, lead_gen_agent, lead_source, business_name, owner_name, phone, email, city, state, current_processor, monthly_volume, notes)
  values (current_date - 1, 'Muhammad Kamran', 'PPC', 'Sunrise Smoke Shop', 'Omar Haddad', '480-555-0177', 'omar@sunrisesmoke.com', 'Phoenix', 'AZ', 'Clover', 4200, 'Low volume, owner hesitant.')
  returning lead_id into l2;

  insert into public.leads (date_created, lead_gen_agent, lead_source, business_name, owner_name, phone, email, city, state, current_processor, monthly_volume, notes)
  values (current_date - 2, 'Harsh Pardeep', 'Referral', 'Golden Wok Express', 'Li Wei', '212-555-0193', 'liwei@goldenwok.com', 'New York', 'NY', 'Toast', 18000, 'Referred by existing merchant.')
  returning lead_id into l3;

  insert into public.leads (date_created, lead_gen_agent, lead_source, business_name, owner_name, phone, email, city, state, current_processor, monthly_volume, notes)
  values (current_date - 6, 'Abdullah Rashid', 'Cold Calling', 'Prime Cuts Butchery', 'Dan Kowalski', '773-555-0122', 'dan@primecuts.com', 'Chicago', 'IL', 'NRS', 12500, '')
  returning lead_id into l4;

  insert into public.leads (date_created, lead_gen_agent, lead_source, business_name, owner_name, phone, email, city, state, current_processor, monthly_volume, notes)
  values (current_date - 8, 'Syed Waleed', 'Data Scrap', 'Lakeside Auto Care', 'Greg Molina', '414-555-0155', 'greg@lakesideauto.com', 'Milwaukee', 'WI', 'Stripe', 22000, '')
  returning lead_id into l5;

  insert into public.leads (date_created, lead_gen_agent, lead_source, business_name, owner_name, phone, email, city, state, current_processor, monthly_volume, notes)
  values (current_date - 9, 'Moses Paul', 'Organic', 'Bella Roma Pizzeria', 'Antonio Ricci', '617-555-0135', 'antonio@bellaroma.com', 'Boston', 'MA', 'Square', 15000, '')
  returning lead_id into l6;

  insert into public.leads (date_created, lead_gen_agent, lead_source, business_name, owner_name, phone, email, city, state, current_processor, monthly_volume, notes)
  values (current_date - 12, 'Jawad Rehman', 'Cold Calling', 'QuickStop Liquors', 'Pete Vance', '303-555-0168', 'pete@quickstopliq.com', 'Denver', 'CO', 'Cash only', 8000, '')
  returning lead_id into l7;

  insert into public.leads (date_created, lead_gen_agent, lead_source, business_name, owner_name, phone, email, city, state, current_processor, monthly_volume, notes)
  values (current_date - 14, 'Arqam Vayani', 'PPC', 'The Fade Factory', 'Marcus Bell', '404-555-0119', 'marcus@fadefactory.com', 'Atlanta', 'GA', 'Square', 11000, '')
  returning lead_id into l8;

  insert into public.leads (date_created, lead_gen_agent, lead_source, business_name, owner_name, phone, email, city, state, current_processor, monthly_volume, notes)
  values (current_date - 16, 'Sufyan Khan', 'Referral', 'Casa Verde Grocery', 'Rosa Delgado', '713-555-0187', 'rosa@casaverde.com', 'Houston', 'TX', 'None', 9800, '')
  returning lead_id into l9;

  insert into public.leads (date_created, lead_gen_agent, lead_source, business_name, owner_name, phone, email, city, state, current_processor, monthly_volume, notes)
  values (current_date - 18, 'Hamza Tariq', 'Cold Calling', 'Ironclad Gym', 'Tony Draper', '702-555-0149', 'tony@ironcladgym.com', 'Las Vegas', 'NV', 'Clover', 16500, '')
  returning lead_id into l10;

  insert into public.leads (date_created, lead_gen_agent, lead_source, business_name, owner_name, phone, email, city, state, current_processor, monthly_volume, notes)
  values (current_date - 21, 'Muhammad Tahir', 'Organic', 'Blossom Nail Spa', 'Hana Kim', '206-555-0173', 'hana@blossomspa.com', 'Seattle', 'WA', 'Square', 13500, '')
  returning lead_id into l11;

  insert into public.leads (date_created, lead_gen_agent, lead_source, business_name, owner_name, phone, email, city, state, current_processor, monthly_volume, notes)
  values (current_date - 25, 'Dayem Aamir', 'Referral', 'Harbor View Seafood', 'Frank Costa', '410-555-0128', 'frank@harborview.com', 'Baltimore', 'MD', 'Toast', 27000, '')
  returning lead_id into l12;

  insert into public.leads (date_created, lead_gen_agent, lead_source, business_name, owner_name, phone, email, city, state, current_processor, monthly_volume, notes)
  values (current_date - 27, 'Faizan Sheikh', 'PPC', 'Desert Bloom Florist', 'Alice Tran', '505-555-0161', 'alice@desertbloom.com', 'Albuquerque', 'NM', 'Stripe', 7200, '')
  returning lead_id into l13;

  insert into public.leads (date_created, lead_gen_agent, lead_source, business_name, owner_name, phone, email, city, state, current_processor, monthly_volume, notes)
  values (current_date - 29, 'Mohibullah', 'Cold Calling', 'Maple Street Bakery', 'Judy Olsen', '503-555-0114', 'judy@maplebakery.com', 'Portland', 'OR', 'Square', 10400, '')
  returning lead_id into l14;

  -- -------------------------------------------------------------------------
  -- QA: l1 stays Pending. l2 disqualified. l3..l14 qualified (creates SQLs).
  -- -------------------------------------------------------------------------
  update public.qa_records set
    us_business = 'Yes', owner_reached = 'Yes', interested = 'No', physical_loc = 'Yes', not_restricted = 'Yes',
    qa_agent = 'Rubay Aamir', qa_decision = 'Disqualified', qa_notes = 'Owner not interested and volume under threshold.'
  where lead_id = l2;

  update public.qa_records set
    us_business = 'Yes', owner_reached = 'Yes', interested = 'Yes', physical_loc = 'Yes', not_restricted = 'Yes',
    qa_agent = 'Aisha Iftikhar', qa_decision = 'Qualified', qa_notes = 'Strong referral, high volume.'
  where lead_id = l3;

  update public.qa_records set
    us_business = 'Yes', owner_reached = 'Yes', interested = 'Yes', physical_loc = 'Yes', not_restricted = 'Yes',
    qa_agent = 'Rubay Aamir', qa_decision = 'Qualified'
  where lead_id in (l4, l5, l6, l7, l8, l9, l10);

  update public.qa_records set
    us_business = 'Yes', owner_reached = 'Yes', interested = 'Yes', physical_loc = 'Yes', not_restricted = 'Yes',
    qa_agent = 'Rida Arshad', qa_decision = 'Qualified'
  where lead_id in (l11, l12, l13, l14);

  -- -------------------------------------------------------------------------
  -- SQL assignment: l3 left Pending; the rest assigned (creates closer deals)
  -- -------------------------------------------------------------------------
  update public.sql_assignments set
    assigned_closer = 'Muhammad Usman Ghauri', assignment_date = current_date - 5, assigned_by = 'Arish Raheel', sql_status = 'Assigned'
  where lead_id in (l4, l8, l12);

  update public.sql_assignments set
    assigned_closer = 'Saad Amdani', assignment_date = current_date - 7, assigned_by = 'Arish Raheel', sql_status = 'Assigned'
  where lead_id in (l5, l9, l13);

  update public.sql_assignments set
    assigned_closer = 'Chris Alex Dean', assignment_date = current_date - 8, assigned_by = 'Arish Raheel', sql_status = 'Assigned'
  where lead_id in (l6, l10, l14);

  update public.sql_assignments set
    assigned_closer = 'Elisha Victor', assignment_date = current_date - 11, assigned_by = 'Arish Raheel', sql_status = 'Assigned'
  where lead_id = l7;

  -- -------------------------------------------------------------------------
  -- Closer pipeline
  -- l4 No Answer (default) · l5 Follow Up · l6 Docs Pending · l7 Closed Lost
  -- l8..l14 Closed Won (creates OPS verifications)
  -- -------------------------------------------------------------------------
  update public.closer_deals set stage = 'Follow Up', connected_date = current_date - 6 where lead_id = l5;
  update public.closer_deals set stage = 'Docs Pending', connected_date = current_date - 7, docs_pending_date = current_date - 6 where lead_id = l6;
  update public.closer_deals set stage = 'Closed Lost', lost_reason = 'Signed a 2-year contract with current processor.', connected_date = current_date - 10, closed_date = current_date - 9 where lead_id = l7;

  update public.closer_deals set stage = 'Closed Won', connected_date = current_date - 12, docs_pending_date = current_date - 11, docs_recd_date = current_date - 10, closed_date = current_date - 9 where lead_id = l8;
  update public.closer_deals set stage = 'Closed Won', connected_date = current_date - 14, docs_recd_date = current_date - 12, closed_date = current_date - 11 where lead_id = l9;
  update public.closer_deals set stage = 'Closed Won', connected_date = current_date - 16, docs_recd_date = current_date - 14, closed_date = current_date - 13 where lead_id = l10;
  update public.closer_deals set stage = 'Closed Won', connected_date = current_date - 19, docs_recd_date = current_date - 17, closed_date = current_date - 16 where lead_id = l11;
  update public.closer_deals set stage = 'Closed Won', connected_date = current_date - 23, docs_recd_date = current_date - 21, closed_date = current_date - 20 where lead_id = l12;
  update public.closer_deals set stage = 'Closed Won', connected_date = current_date - 25, docs_recd_date = current_date - 23, closed_date = current_date - 22 where lead_id = l13;
  update public.closer_deals set stage = 'Closed Won', connected_date = current_date - 27, docs_recd_date = current_date - 25, closed_date = current_date - 24 where lead_id = l14;

  -- -------------------------------------------------------------------------
  -- OPS verification
  -- l8 Pending · l9 Disapproved (missing docs) · l10..l14 Approved (creates MSP)
  -- -------------------------------------------------------------------------
  update public.ops_verifications set
    brand = 'Prisma Tech', dl_recd = 'Yes', voided_check = 'No', bank_stmt = 'No',
    owner_name_verified = 'Yes', owner_phone_verified = 'Yes', business_verified = 'Yes',
    ops_status = 'Disapproved', reasoning = 'Voided check and bank statement missing.',
    ops_agent = 'Takchand Das', ops_date = current_date - 10, accuracy_review = 'Pass'
  where lead_id = l9;

  update public.ops_verifications set
    brand = 'Soiree INC', dl_recd = 'Yes', voided_check = 'Yes', bank_stmt = 'Yes',
    owner_name_verified = 'Yes', owner_phone_verified = 'Yes', business_verified = 'Yes',
    ops_status = 'Approved', reasoning = 'All six checks verified.',
    ops_agent = 'Rida Waseem', ops_date = current_date - 12, accuracy_review = 'Pass'
  where lead_id = l10;

  update public.ops_verifications set
    brand = 'Genesys', dl_recd = 'Yes', voided_check = 'Yes', bank_stmt = 'Yes',
    owner_name_verified = 'Yes', owner_phone_verified = 'Yes', business_verified = 'Yes',
    ops_status = 'Approved', reasoning = 'Clean file.',
    ops_agent = 'Takchand Das', ops_date = current_date - 15
  where lead_id = l11;

  update public.ops_verifications set
    brand = 'Soiree INC', dl_recd = 'Yes', voided_check = 'Yes', bank_stmt = 'Yes',
    owner_name_verified = 'Yes', owner_phone_verified = 'Yes', business_verified = 'Yes',
    ops_status = 'Approved', reasoning = 'Verified against bank records.',
    ops_agent = 'Rida Waseem', ops_date = current_date - 19, accuracy_review = 'Pass'
  where lead_id = l12;

  update public.ops_verifications set
    brand = 'Prisma Tech', dl_recd = 'Yes', voided_check = 'Yes', bank_stmt = 'Yes',
    owner_name_verified = 'Yes', owner_phone_verified = 'Yes', business_verified = 'Yes',
    ops_status = 'Approved', reasoning = 'All documents on file.',
    ops_agent = 'Takchand Das', ops_date = current_date - 21
  where lead_id = l13;

  update public.ops_verifications set
    brand = 'Genesys', dl_recd = 'Yes', voided_check = 'Yes', bank_stmt = 'Yes',
    owner_name_verified = 'Yes', owner_phone_verified = 'Yes', business_verified = 'Yes',
    ops_status = 'Approved', reasoning = 'Verified.',
    ops_agent = 'Rida Waseem', ops_date = current_date - 23
  where lead_id = l14;

  -- -------------------------------------------------------------------------
  -- MSP onboarding
  -- l10: attempt 1 failed 3 days ago, no follow-up -> FATAL SLA row
  -- l11: attempt 1 Yes -> Approved (creates fulfillment + leasing)
  -- l12: attempt 1 No, attempt 2 Yes next day -> Approved
  -- l13, l14: attempt 1 Yes -> Approved
  -- -------------------------------------------------------------------------
  update public.msp_onboarding set
    onboarding_sp = 'Taha Malik',
    a1_date = current_date - 3, a1_provider = 'Paysafe', a1_result = 'No', a1_reason = 'Credit score below MSP minimum.'
  where lead_id = l10;

  update public.msp_onboarding set
    onboarding_sp = 'Hassan ul Haq',
    a1_date = current_date - 13, a1_provider = 'CardConnect/Soiree', a1_result = 'Yes',
    approved_date = current_date - 13, final_reasoning = 'Approved on first attempt.',
    equip_order_date = current_date - 12, device = 'Clover Flex', tracking_number = '1Z999AA10123456784'
  where lead_id = l11;

  update public.msp_onboarding set
    onboarding_sp = 'Taha Malik',
    a1_date = current_date - 18, a1_provider = 'Nexio', a1_result = 'No', a1_reason = 'Bank mismatch on application.',
    a2_date = current_date - 17, a2_provider = 'CardConnect/Genesys', a2_result = 'Yes',
    approved_date = current_date - 17, final_reasoning = 'Resubmitted with corrected banking details.',
    equip_order_date = current_date - 16, device = 'PAX A920', tracking_number = '1Z999AA10198765432',
    delivery_date = current_date - 14, shipping_cost = 45
  where lead_id = l12;

  update public.msp_onboarding set
    onboarding_sp = 'Tuba Muzammil',
    a1_date = current_date - 20, a1_provider = 'Payroc', a1_result = 'Yes',
    approved_date = current_date - 20, final_reasoning = 'Straightforward approval.',
    equip_order_date = current_date - 19, device = 'Clover Mini', tracking_number = '1Z999AA10111222333',
    delivery_date = current_date - 17, shipping_cost = 38
  where lead_id = l13;

  update public.msp_onboarding set
    onboarding_sp = 'Hassan ul Haq',
    a1_date = current_date - 22, a1_provider = 'Shift4', a1_result = 'Yes',
    approved_date = current_date - 22, final_reasoning = 'Approved.',
    equip_order_date = current_date - 21, device = 'Clover Flex', tracking_number = '1Z999AA10144556677',
    delivery_date = current_date - 19, shipping_cost = 42
  where lead_id = l14;

  -- -------------------------------------------------------------------------
  -- Fulfillment
  -- l11 Equipment Shipped · l12 Live · l13 Installed · l14 Live
  -- -------------------------------------------------------------------------
  update public.fulfillment set fulfillment_stage = 'Equipment Shipped', hardware = 'Clover Flex', serial = 'CF-88214-A' where lead_id = l11;
  update public.fulfillment set fulfillment_stage = 'Live', hardware = 'PAX A920', serial = 'PX-55190-B', live_date = current_date - 12 where lead_id = l12;
  update public.fulfillment set fulfillment_stage = 'Installed', hardware = 'Clover Mini', serial = 'CM-33077-C' where lead_id = l13;
  update public.fulfillment set fulfillment_stage = 'Live', hardware = 'Clover Flex', serial = 'CF-90332-D', live_date = current_date - 16 where lead_id = l14;

  -- -------------------------------------------------------------------------
  -- Leasing
  -- l11 Submitted · l12/l13/l14 Funded (creates retention records)
  -- -------------------------------------------------------------------------
  update public.leasing set
    leasing_company = 'ELG', order_activation = current_date - 11, monthly_lease = 129,
    approved_funding = 3200, shipping_cost = 45, funding_status = 'Submitted', invoice_no = 'INV-2104'
  where lead_id = l11;

  update public.leasing set
    leasing_company = 'FDGL', order_activation = current_date - 13, monthly_lease = 149,
    approved_funding = 4100, shipping_cost = 45, funding_status = 'Funded', funding_date = current_date - 11, invoice_no = 'INV-2087'
  where lead_id = l12;

  update public.leasing set
    leasing_company = 'ClickLease', order_activation = current_date - 16, monthly_lease = 119,
    approved_funding = 2900, shipping_cost = 38, funding_status = 'Funded', funding_date = current_date - 14, invoice_no = 'INV-2071'
  where lead_id = l13;

  update public.leasing set
    leasing_company = 'PEAC', order_activation = current_date - 18, monthly_lease = 139,
    approved_funding = 3600, shipping_cost = 42, funding_status = 'Funded', funding_date = current_date - 17, invoice_no = 'INV-2064'
  where lead_id = l14;

  -- -------------------------------------------------------------------------
  -- Customer Success
  -- l12 Active · l13 At Risk · l14 Churned
  -- -------------------------------------------------------------------------
  update public.retention set agent_name = 'Alwaz Khan' where lead_id = l12;
  update public.retention set agent_name = 'Atta Muhammad', status = 'At Risk', handover_notes = 'Merchant unhappy with lease terms - needs a call this week.' where lead_id = l13;
  update public.retention set agent_name = 'Ahmed Raza', status = 'Churned', handover_notes = 'Switched back to previous processor.' where lead_id = l14;

  insert into public.retention_comments (lead_id, author, body) values
    (l12, 'Alwaz Khan', 'Welcome call done. Merchant processing smoothly on the new terminal.'),
    (l13, 'Atta Muhammad', 'Merchant raised a complaint about the monthly lease amount. Escalated to CS lead.'),
    (l13, 'Anas Khan', 'Offered a rate review. Follow-up scheduled.'),
    (l14, 'Ahmed Raza', 'Merchant stopped processing. Multiple contact attempts failed.');

  raise notice 'Demo data created: 14 leads across all pipeline stages (%..%).', l1, l14;
end $$;
