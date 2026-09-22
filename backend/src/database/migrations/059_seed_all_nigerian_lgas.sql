-- ============================================================
-- 059_seed_all_nigerian_lgas.sql
-- Migration 045 activated all 36 states + FCT for selection
-- (states.is_active = true), but only migration 046 ever seeded
-- actual LGA rows — for Delta State alone. Every other state has
-- zero LGAs, so the cascading State -> LGA -> Area selector shows
-- an empty LGA list for 36 of the 37 entries. This seeds the
-- official LGAs for every remaining state (774 LGAs nationwide is
-- the standard count; Delta's 25 are already present from 046).
--
-- Sourced from general knowledge of Nigeria's administrative
-- divisions (a stable, publicly documented dataset, not something
-- that changes often) rather than a live authoritative API — spot-
-- checking against NPC/INEC's official LGA list before relying on
-- this for anything legally sensitive is a reasonable precaution.
--
-- Area-level (city/town) data is intentionally NOT added here for
-- these states — see areas.md / locationSelect.js's "Select an area
-- (optional)" placeholder, which already treats an empty area list
-- as a normal, non-blocking case (the field is optional everywhere
-- it's used). Populating area-level data for 774 LGAs is a much
-- larger undertaking than state/LGA coverage and is left for a
-- future pass.
-- ============================================================

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Aba North','Aba South','Arochukwu','Bende','Ikwuano','Isiala Ngwa North','Isiala Ngwa South',
  'Isuikwuato','Obi Ngwa','Ohafia','Osisioma','Ugwunagbo','Ukwa East','Ukwa West','Umuahia North',
  'Umuahia South','Umu Nneochi'
])
FROM states WHERE name = 'Abia';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Abaji','Bwari','Gwagwalada','Kuje','Kwali','Municipal Area Council'
])
FROM states WHERE name = 'Abuja (FCT)';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Demsa','Fufure','Ganye','Gayuk','Gombi','Grie','Hong','Jada','Lamurde','Madagali','Maiha',
  'Mayo Belwa','Michika','Mubi North','Mubi South','Numan','Shelleng','Song','Toungo','Yola North',
  'Yola South'
])
FROM states WHERE name = 'Adamawa';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Abak','Eastern Obolo','Eket','Esit Eket','Essien Udim','Etim Ekpo','Etinan','Ibeno','Ibesikpo Asutan',
  'Ibiono-Ibom','Ika','Ikono','Ikot Abasi','Ikot Ekpene','Ini','Itu','Mbo','Mkpat-Enin','Nsit-Atai',
  'Nsit-Ibom','Nsit-Ubium','Obot Akara','Okobo','Onna','Oron','Oruk Anam','Udung-Uko','Ukanafun',
  'Uruan','Urue-Offong/Oruko','Uyo'
])
FROM states WHERE name = 'Akwa Ibom';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Aguata','Anambra East','Anambra West','Anaocha','Awka North','Awka South','Ayamelum','Dunukofia',
  'Ekwusigo','Idemili North','Idemili South','Ihiala','Njikoka','Nnewi North','Nnewi South','Ogbaru',
  'Onitsha North','Onitsha South','Orumba North','Orumba South','Oyi'
])
FROM states WHERE name = 'Anambra';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Alkaleri','Bauchi','Bogoro','Damban','Darazo','Dass','Gamawa','Ganjuwa','Giade','Itas/Gadau',
  'Jama''are','Katagum','Kirfi','Misau','Ningi','Shira','Tafawa Balewa','Toro','Warji','Zaki'
])
FROM states WHERE name = 'Bauchi';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Brass','Ekeremor','Kolokuma/Opokuma','Nembe','Ogbia','Sagbama','Southern Ijaw','Yenagoa'
])
FROM states WHERE name = 'Bayelsa';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Ado','Agatu','Apa','Buruku','Gboko','Guma','Gwer East','Gwer West','Katsina-Ala','Konshisha',
  'Kwande','Logo','Makurdi','Obi','Ogbadibo','Ohimini','Oju','Okpokwu','Otukpo','Tarka','Ukum',
  'Ushongo','Vandeikya'
])
FROM states WHERE name = 'Benue';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Abadam','Askira/Uba','Bama','Bayo','Biu','Chibok','Damboa','Dikwa','Gubio','Guzamala','Gwoza',
  'Hawul','Jere','Kaga','Kala/Balge','Konduga','Kukawa','Kwaya Kusar','Mafa','Magumeri','Maiduguri',
  'Marte','Mobbar','Monguno','Ngala','Nganzai','Shani'
])
FROM states WHERE name = 'Borno';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Abi','Akamkpa','Akpabuyo','Bakassi','Bekwarra','Biase','Boki','Calabar Municipal','Calabar South',
  'Etung','Ikom','Obanliku','Obubra','Obudu','Odukpani','Ogoja','Yakull','Yala'
])
FROM states WHERE name = 'Cross River';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Abakaliki','Afikpo North','Afikpo South','Ebonyi','Ezza North','Ezza South','Ikwo','Ishielu',
  'Ivo','Izzi','Ohaozara','Ohaukwu','Onicha'
])
FROM states WHERE name = 'Ebonyi';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Akoko-Edo','Egor','Esan Central','Esan North-East','Esan South-East','Esan West','Etsako Central',
  'Etsako East','Etsako West','Igueben','Ikpoba Okha','Orhionmwon','Oredo','Ovia North-East',
  'Ovia South-West','Owan East','Owan West','Uhunmwonde'
])
FROM states WHERE name = 'Edo';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Ado Ekiti','Efon','Ekiti East','Ekiti South-West','Ekiti West','Emure','Gbonyin','Ido Osi',
  'Ijero','Ikere','Ikole','Ilejemeje','Irepodun/Ifelodun','Ise/Orun','Moba','Oye'
])
FROM states WHERE name = 'Ekiti';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Aninri','Awgu','Enugu East','Enugu North','Enugu South','Ezeagu','Igbo Etiti','Igbo Eze North',
  'Igbo Eze South','Isi Uzo','Nkanu East','Nkanu West','Nsukka','Oji River','Udenu','Udi','Uzo Uwani'
])
FROM states WHERE name = 'Enugu';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Akko','Balanga','Billiri','Dukku','Funakaye','Gombe','Kaltungo','Kwami','Nafada','Shongom',
  'Yamaltu/Deba'
])
FROM states WHERE name = 'Gombe';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Aboh Mbaise','Ahiazu Mbaise','Ehime Mbano','Ezinihitte','Ideato North','Ideato South','Ihitte/Uboma',
  'Ikeduru','Isiala Mbano','Isu','Mbaitoli','Ngor Okpala','Njaba','Nkwerre','Nwangele','Obowo',
  'Oguta','Ohaji/Egbema','Okigwe','Onuimo','Orlu','Orsu','Oru East','Oru West','Owerri Municipal',
  'Owerri North','Owerri West'
])
FROM states WHERE name = 'Imo';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Auyo','Babura','Biriniwa','Birnin Kudu','Buji','Dutse','Gagarawa','Garki','Gumel','Guri',
  'Gwaram','Gwiwa','Hadejia','Jahun','Kafin Hausa','Kaugama','Kazaure','Kiri Kasama','Kiyawa',
  'Maigatari','Malam Madori','Miga','Ringim','Roni','Sule Tankarkar','Taura','Yankwashi'
])
FROM states WHERE name = 'Jigawa';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Birnin Gwari','Chikun','Giwa','Igabi','Ikara','Jaba','Jema''a','Kachia','Kaduna North',
  'Kaduna South','Kagarko','Kajuru','Kaura','Kauru','Kubau','Kudan','Lere','Makarfi','Sabon Gari',
  'Sanga','Soba','Zangon Kataf','Zaria'
])
FROM states WHERE name = 'Kaduna';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Ajingi','Albasu','Bagwai','Bebeji','Bichi','Bunkure','Dala','Dambatta','Dawakin Kudu',
  'Dawakin Tofa','Doguwa','Fagge','Gabasawa','Garko','Garun Mallam','Gaya','Gezawa','Gwale',
  'Gwarzo','Kabo','Kano Municipal','Karaye','Kibiya','Kiru','Kumbotso','Kunchi','Kura','Madobi',
  'Makoda','Minjibir','Nasarawa','Rano','Rimin Gado','Rogo','Shanono','Sumaila','Takai','Tarauni',
  'Tofa','Tsanyawa','Tudun Wada','Ungogo','Warawa','Wudil'
])
FROM states WHERE name = 'Kano';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Bakori','Batagarawa','Batsari','Baure','Bindawa','Charanchi','Dan Musa','Dandume','Danja',
  'Daura','Dutsi','Dutsin-Ma','Faskari','Funtua','Ingawa','Jibia','Kafur','Kaita','Kankara',
  'Kankia','Katsina','Kurfi','Kusada','Mai''Adua','Malumfashi','Mani','Mashi','Matazu','Musawa',
  'Rimi','Sabuwa','Safana','Sandamu','Zango'
])
FROM states WHERE name = 'Katsina';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Aleiro','Arewa Dandi','Argungu','Augie','Bagudo','Birnin Kebbi','Bunza','Dandi','Fakai','Gwandu',
  'Jega','Kalgo','Koko/Besse','Maiyama','Ngaski','Sakaba','Shanga','Suru','Wasagu/Danko','Yauri',
  'Zuru'
])
FROM states WHERE name = 'Kebbi';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Adavi','Ajaokuta','Ankpa','Bassa','Dekina','Ibaji','Idah','Igalamela Odolu','Ijumu','Kabba/Bunu',
  'Kogi','Lokoja','Mopa Muro','Ofu','Ogori/Magongo','Okehi','Okene','Olamaboro','Omala','Yagba East',
  'Yagba West'
])
FROM states WHERE name = 'Kogi';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Asa','Baruten','Edu','Ekiti','Ifelodun','Ilorin East','Ilorin South','Ilorin West','Irepodun',
  'Isin','Kaiama','Moro','Offa','Oke Ero','Oyun','Pategi'
])
FROM states WHERE name = 'Kwara';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Agege','Ajeromi-Ifelodun','Alimosho','Amuwo-Odofin','Apapa','Badagry','Epe','Eti Osa',
  'Ibeju-Lekki','Ifako-Ijaiye','Ikeja','Ikorodu','Kosofe','Lagos Island','Lagos Mainland',
  'Mushin','Ojo','Oshodi-Isolo','Shomolu','Surulere'
])
FROM states WHERE name = 'Lagos';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Akwanga','Awe','Doma','Karu','Keana','Keffi','Kokona','Lafia','Nasarawa','Nasarawa Egon',
  'Obi','Toto','Wamba'
])
FROM states WHERE name = 'Nasarawa';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Agaie','Agwara','Bida','Borgu','Bosso','Chanchaga','Edati','Gbako','Gurara','Katcha','Kontagora',
  'Lapai','Lavun','Magama','Mariga','Mashegu','Mokwa','Moya','Paikoro','Rafi','Rijau','Shiroro',
  'Suleja','Tafa','Wushishi'
])
FROM states WHERE name = 'Niger';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Abeokuta North','Abeokuta South','Ado-Odo/Ota','Ewekoro','Ifo','Ijebu East','Ijebu North',
  'Ijebu North East','Ijebu Ode','Ikenne','Imeko Afon','Ipokia','Obafemi Owode','Odeda','Odogbolu',
  'Ogun Waterside','Remo North','Shagamu','Yewa North','Yewa South'
])
FROM states WHERE name = 'Ogun';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Akoko North-East','Akoko North-West','Akoko South-East','Akoko South-West','Akure North',
  'Akure South','Ese Odo','Idanre','Ifedore','Ilaje','Ile Oluji/Okeigbo','Irele','Odigbo','Okitipupa',
  'Ondo East','Ondo West','Ose','Owo'
])
FROM states WHERE name = 'Ondo';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Aiyedaade','Aiyedire','Atakunmosa East','Atakunmosa West','Boluwaduro','Boripe','Ede North',
  'Ede South','Egbedore','Ejigbo','Ife Central','Ife East','Ife North','Ife South','Ifedayo',
  'Ifelodun','Ila','Ilesa East','Ilesa West','Irepodun','Irewole','Isokan','Iwo','Obokun',
  'Odo Otin','Ola Oluwa','Olorunda','Oriade','Orolu','Osogbo'
])
FROM states WHERE name = 'Osun';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Afijio','Akinyele','Atiba','Atisbo','Egbeda','Ibadan North','Ibadan North-East','Ibadan North-West',
  'Ibadan South-East','Ibadan South-West','Ibarapa Central','Ibarapa East','Ibarapa North',
  'Ido','Irepo','Iseyin','Itesiwaju','Iwajowa','Kajola','Lagelu','Ogbomosho North','Ogbomosho South',
  'Ogo Oluwa','Olorunsogo','Oluyole','Ona Ara','Orelope','Ori Ire','Oyo East','Oyo West','Saki East',
  'Saki West','Surulere'
])
FROM states WHERE name = 'Oyo';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Bakura','Bassar','Bukkuyum','Chafe','Gada','Gummi','Gusau','Kaura Namoda','Maradun','Maru',
  'Shinkafi','Talata Mafara','Tsafe','Zurmi'
])
FROM states WHERE name = 'Zamfara';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Bali','Donga','Gashaka','Gassol','Ibi','Jalingo','Karim Lamido','Kumi','Lau','Sardauna',
  'Takum','Ussa','Wukari','Yorro','Zing'
])
FROM states WHERE name = 'Taraba';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Bade','Bursari','Damaturu','Fika','Fune','Geidam','Gujba','Gulani','Jakusko','Karasuwa',
  'Machina','Nangere','Nguru','Potiskum','Tarmuwa','Yunusari','Yusufari'
])
FROM states WHERE name = 'Yobe';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Bokkos','Barkin Ladi','Bassa','Jos East','Jos North','Jos South','Kanam','Kanke','Langtang North',
  'Langtang South','Mangu','Mikang','Pankshin','Qua''an Pan','Riyom','Shendam','Wase'
])
FROM states WHERE name = 'Plateau';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Abua/Odual','Ahoada East','Ahoada West','Akuku-Toru','Andoni','Asari-Toru','Bonny','Degema',
  'Emuoha','Eleme','Etche','Gokana','Ikwerre','Khana','Obio/Akpor','Ogba/Egbema/Ndoni','Ogu/Bolo',
  'Okrika','Omuma','Opobo/Nkoro','Oyigbo','Port Harcourt','Tai'
])
FROM states WHERE name = 'Rivers';

INSERT INTO lgas (state_id, name)
SELECT id, unnest(ARRAY[
  'Binji','Bodinga','Dange Shuni','Gada','Goronyo','Gudu','Gwadabawa','Illela','Isa','Kebbe',
  'Kware','Rabah','Sabon Birni','Shagari','Silame','Sokoto North','Sokoto South','Tambuwal',
  'Tangaza','Tureta','Wamako','Wurno','Yabo'
])
FROM states WHERE name = 'Sokoto';
