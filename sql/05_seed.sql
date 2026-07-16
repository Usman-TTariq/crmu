-- ============================================================================
-- TGT Nexus CRM — 05_seed.sql
-- Teams + roster profiles (no auth users yet — admins create logins from the
-- Team Setup tab, which links auth.users to these profiles by full_name).
-- Run after 04_dashboards.sql. Safe to re-run (upserts).
-- ============================================================================

insert into public.teams (name) values
  ('Olympus'), ('Phoenix'), ('Spartan'), ('Titans')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Roster
-- ---------------------------------------------------------------------------
insert into public.profiles (full_name, title, dept, team, role_key, target) values
  -- Leadership
  ('CEO',                     'CEO',                     'ALL',   '',        'ceo',            ''),
  ('Abdullah Zahid',          'Super Admin',             'ALL',   '',        'super_admin',    ''),
  ('Arish Raheel',            'Sales Head & QA',         'SALES', '',        'sales_head',     ''),
  ('Muhammad Ubaid',          'AVP Sales',               'SALES', '',        'avp_sales',      ''),
  ('Roshaan Aamir',           'Floor Manager',           'SALES', '',        'floor_manager',  ''),

  -- Olympus pod
  ('Rehmatullah',             'Lead Gen Supervisor',     'SALES', 'Olympus', 'lg_sup',   '2 SQL/Agent/Day'),
  ('Ezekiel Bhatti',          'Lead Gen Agent',          'SALES', 'Olympus', 'lg_agent', '2 SQL/Day'),
  ('Arqam Vayani',            'Lead Gen Agent',          'SALES', 'Olympus', 'lg_agent', '2 SQL/Day'),
  ('Syed Waleed',             'Lead Gen Agent',          'SALES', 'Olympus', 'lg_agent', '2 SQL/Day'),
  ('Dayem Aamir',             'Lead Gen Agent',          'SALES', 'Olympus', 'lg_agent', '2 SQL/Day'),
  ('Alexzander',              'Lead Gen Agent',          'SALES', 'Olympus', 'lg_agent', '2 SQL/Day'),
  ('Syed Muhammad Ayan Ali',  'Lead Gen Agent',          'SALES', 'Olympus', 'lg_agent', '2 SQL/Day'),
  ('Ayesha Khan',             'Lead Gen Agent',          'SALES', 'Olympus', 'lg_agent', '2 SQL/Day'),
  ('Hasnain Zulfiqar',        'Lead Gen Agent',          'SALES', 'Olympus', 'lg_agent', '2 SQL/Day'),
  ('Muhammad Usman Ghauri',   'Closer',                  'SALES', 'Olympus', 'closer',   '$1,250'),
  ('Muhammad Ahsan',          'Closer',                  'SALES', 'Olympus', 'closer',   '$500'),
  ('Sahar Brian Wylie',       'Tier 3',                  'SALES', 'Olympus', 'closer',   '$250'),
  ('Muniza',                  'Tier 3',                  'SALES', 'Olympus', 'closer',   '$250'),

  -- Phoenix pod
  ('Maria Luqman',            'Lead Gen Supervisor',     'SALES', 'Phoenix', 'lg_sup',   '2 SQL/Agent/Day'),
  ('Muhammad Kamran',         'Lead Gen Agent',          'SALES', 'Phoenix', 'lg_agent', '2 SQL/Day'),
  ('Moses Paul',              'Lead Gen Agent',          'SALES', 'Phoenix', 'lg_agent', '2 SQL/Day'),
  ('Sufyan Khan',             'Lead Gen Agent',          'SALES', 'Phoenix', 'lg_agent', '2 SQL/Day'),
  ('Faizan Sheikh',           'Lead Gen Agent',          'SALES', 'Phoenix', 'lg_agent', '2 SQL/Day'),
  ('M. Fuzail Ali Khan',      'Lead Gen Agent',          'SALES', 'Phoenix', 'lg_agent', '2 SQL/Day'),
  ('Shaloom Princess',        'Lead Gen Agent',          'SALES', 'Phoenix', 'lg_agent', '2 SQL/Day'),
  ('Areeba Hussain Kazi',     'Lead Gen Agent',          'SALES', 'Phoenix', 'lg_agent', '2 SQL/Day'),
  ('Bradley Thomas',          'Lead Gen Agent',          'SALES', 'Phoenix', 'lg_agent', '2 SQL/Day'),
  ('Hassan Khan',             'Lead Gen Agent',          'SALES', 'Phoenix', 'lg_agent', '2 SQL/Day'),
  ('Daniyal Jamil',           'Lead Gen Agent',          'SALES', 'Phoenix', 'lg_agent', '2 SQL/Day'),
  ('Saad Amdani',             'Closer',                  'SALES', 'Phoenix', 'closer',   '$1,250'),
  ('Elisha Pervaiz',          'Closer',                  'SALES', 'Phoenix', 'closer',   '$500'),
  ('Yaeel',                   'Tier 3',                  'SALES', 'Phoenix', 'closer',   '$250'),
  ('Doris Massey',            'Tier 3',                  'SALES', 'Phoenix', 'closer',   '$250'),

  -- Spartan pod
  ('Bisman Khokhar',          'Lead Gen Supervisor',     'SALES', 'Spartan', 'lg_sup',   '2 SQL/Agent/Day'),
  ('Ayesha Khan (Old)',       'Lead Gen Agent',          'SALES', 'Spartan', 'lg_agent', '2 SQL/Day'),
  ('Abdullah Rashid',         'Lead Gen Agent',          'SALES', 'Spartan', 'lg_agent', '2 SQL/Day'),
  ('Brendon D''souza',        'Lead Gen Agent',          'SALES', 'Spartan', 'lg_agent', '2 SQL/Day'),
  ('Muhammad Zohaib Siddiqui','Lead Gen Agent',          'SALES', 'Spartan', 'lg_agent', '2 SQL/Day'),
  ('Rodab Kamil',             'Lead Gen Agent',          'SALES', 'Spartan', 'lg_agent', '2 SQL/Day'),
  ('Ribca Harrison',          'Lead Gen Agent',          'SALES', 'Spartan', 'lg_agent', '2 SQL/Day'),
  ('Xavier',                  'Lead Gen Agent',          'SALES', 'Spartan', 'lg_agent', '2 SQL/Day'),
  ('Muhammad Jawwad',         'Lead Gen Agent',          'SALES', 'Spartan', 'lg_agent', '2 SQL/Day'),
  ('Hamza Tariq',             'Lead Gen Agent',          'SALES', 'Spartan', 'lg_agent', '2 SQL/Day'),
  ('Hassan Waseem',           'Lead Gen Agent',          'SALES', 'Spartan', 'lg_agent', '2 SQL/Day'),
  ('Chris Alex Dean',         'Closer',                  'SALES', 'Spartan', 'closer',   '$750'),
  ('Moosa Butt',              'Closer',                  'SALES', 'Spartan', 'closer',   '$750'),
  ('Zarlish',                 'Tier 3',                  'SALES', 'Spartan', 'closer',   '$250'),
  ('Muhammad Ayan',           'Tier 3',                  'SALES', 'Spartan', 'closer',   '$300'),

  -- Titans pod
  ('Shayan Anjum',            'Lead Gen Supervisor',     'SALES', 'Titans',  'lg_sup',   '2 SQL/Agent/Day'),
  ('Harsh Pardeep',           'Lead Gen Agent',          'SALES', 'Titans',  'lg_agent', '2 SQL/Day'),
  ('Muhammad Tahir',          'Lead Gen Agent',          'SALES', 'Titans',  'lg_agent', '2 SQL/Day'),
  ('Jawad Rehman',            'Lead Gen Agent',          'SALES', 'Titans',  'lg_agent', '2 SQL/Day'),
  ('Muhammad Ali Maaz',       'Lead Gen Agent',          'SALES', 'Titans',  'lg_agent', '2 SQL/Day'),
  ('Shayan Saleem',           'Lead Gen Agent',          'SALES', 'Titans',  'lg_agent', '2 SQL/Day'),
  ('Jasaiah Prince',          'Lead Gen Agent',          'SALES', 'Titans',  'lg_agent', '2 SQL/Day'),
  ('Laiba Khan',              'Lead Gen Agent',          'SALES', 'Titans',  'lg_agent', '2 SQL/Day'),
  ('Mohibullah',              'Lead Gen Agent',          'SALES', 'Titans',  'lg_agent', '2 SQL/Day'),
  ('Samiullah Amjad',         'Lead Gen Agent',          'SALES', 'Titans',  'lg_agent', '2 SQL/Day'),
  ('Almir Ahmed Sheikh',      'Lead Gen Agent',          'SALES', 'Titans',  'lg_agent', '2 SQL/Day'),
  ('Elisha Victor',           'Closer',                  'SALES', 'Titans',  'closer',   '$750'),
  ('Flavia',                  'Closer',                  'SALES', 'Titans',  'closer',   '$750'),
  ('Muhammad Areeb Siddiqui', 'Tier 3',                  'SALES', 'Titans',  'closer',   '$300'),
  ('Asif Indrias',            'Tier 3',                  'SALES', 'Titans',  'closer',   '$250'),

  -- Sales QA
  ('Rubay Aamir',             'QA Agent',                'SALES', '',        'qa_agent', ''),
  ('Aisha Iftikhar',          'QA Agent',                'SALES', '',        'qa_agent', ''),
  ('Rida Arshad',             'QA Agent',                'SALES', '',        'qa_agent', ''),
  ('Oscar Calderia',          'QA Agent',                'SALES', '',        'qa_agent', ''),

  -- OPS
  ('Rubab Waseem',            'Manager',                 'OPS',   '',        'ops_manager',     ''),
  ('Wamiq Ayaz',              'Assistant Manager',       'OPS',   '',        'ops_am',          ''),
  ('Ainan Amjad',             'Onboarding Lead',         'OPS',   '',        'onboarding_lead', ''),
  ('Taha Malik',              'Onboarding Agent',        'OPS',   '',        'onb_agent',       ''),
  ('Hassan ul Haq',           'Onboarding Agent',        'OPS',   '',        'onb_agent',       ''),
  ('Tuba Muzammil',           'Onboarding Agent',        'OPS',   '',        'onb_agent',       ''),
  ('Syed Abdur Rehman',       'Customer Success Head',   'OPS',   '',        'cs_head',         ''),
  ('Anas Khan',               'Customer Success Lead',   'OPS',   '',        'cs_lead',         ''),
  ('Alwaz Khan',              'Customer Success Agent',  'OPS',   '',        'cs_agent',        ''),
  ('Atta Muhammad',           'Customer Success Agent',  'OPS',   '',        'cs_agent',        ''),
  ('Ahmed Raza',              'Customer Success Agent',  'OPS',   '',        'cs_agent',        ''),
  ('Shumaiza Kanwal',         'Customer Success Agent',  'OPS',   '',        'cs_agent',        ''),
  ('Shaikh Subhan',           'Customer Success Agent',  'OPS',   '',        'cs_agent',        ''),
  ('Abdul Sami',              'Customer Success Agent',  'OPS',   '',        'cs_agent',        ''),
  ('Muhammad Wahaj',          'Customer Success Agent',  'OPS',   '',        'cs_agent',        ''),
  ('Affan Salman',            'Customer Success Agent',  'OPS',   '',        'cs_agent',        ''),
  ('Rida Waseem',             'QA & Funding Lead',       'OPS',   '',        'ops_verifier',    ''),
  ('Takchand Das',            'Quality Assurance',       'OPS',   '',        'ops_qa_agent',    '')
on conflict (full_name) do update
set title = excluded.title,
    dept = excluded.dept,
    team = excluded.team,
    role_key = excluded.role_key,
    target = excluded.target;
