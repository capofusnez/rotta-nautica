/* Elenco di marchi e modelli proposti nella scheda della barca (check-list).
   Non è completo: se marchio o modello non ci sono si scrivono a mano.
   barche: marchio -> { k: tipo di mezzo proposto (null se il cantiere fa sia vela sia motore), e: motore proposto, m: modelli o serie }
   motori: marchio -> { tipo di motore: modelli }  (tipi come in checklist.js: fb4, fb2, efbB, efbD, ebD, ebB, moto, el) */
window.RN_CAT = {
  barche: {
    'Jeanneau': { k: null, m: ['Cap Camarat 5.5 CC', 'Cap Camarat 6.5 CC', 'Cap Camarat 6.5 WA', 'Cap Camarat 7.5 CC', 'Cap Camarat 7.5 WA', 'Cap Camarat 9.0 CC', 'Cap Camarat 9.0 WA', 'Cap Camarat 10.5 WA', 'Merry Fisher 605', 'Merry Fisher 695', 'Merry Fisher 795', 'Merry Fisher 895', 'Merry Fisher 1095', 'Leader 30', 'Leader 33', 'NC 37', 'Sun Odyssey 319', 'Sun Odyssey 349', 'Sun Odyssey 380', 'Sun Odyssey 410', 'Sun Odyssey 440', 'Sun Odyssey 490', 'Sun Fast 3300'] },
    'Bénéteau': { k: null, m: ['Flyer 6 Spacedeck', 'Flyer 7 Sundeck', 'Flyer 8 Spacedeck', 'Flyer 9 Sundeck', 'Flyer 10', 'Antares 7', 'Antares 8', 'Antares 9', 'Antares 11', 'Gran Turismo 32', 'Gran Turismo 36', 'Oceanis 30.1', 'Oceanis 34.1', 'Oceanis 38.1', 'Oceanis 40.1', 'Oceanis 46.1', 'First 27', 'First 36', 'First 44'] },
    'Quicksilver': { k: 'motore', m: ['Activ 455 Open', 'Activ 505 Open', 'Activ 555 Open', 'Activ 605 Open', 'Activ 675 Open', 'Activ 555 Cabin', 'Activ 605 Cruiser', 'Activ 755 Sundeck', 'Activ 805 Cruiser', 'Activ 875 Sundeck', 'Captur 505', 'Captur 555', 'Captur 605', 'Captur 905'] },
    'Ranieri International': { k: 'motore', m: ['Voyager 21S', 'Voyager 23S', 'Voyager 26S', 'Cayman 19 Sport', 'Cayman 21 Sport', 'Cayman 23 Sport', 'Cayman 26 Sport', 'Cayman 35'] },
    'Saver': { k: 'motore', m: ['Riviera 18', 'Riviera 20', 'Riviera 24', 'Manta 21', 'Manta 23', '220 WA', '250 WA', '270 WA', '300 Sport', '330 Sport', '33 Open', '360 Sport', '420 Sport', '6.2 Cabin', '6.5 Cabin', '7.0 Cabin', '7.5 Cabin', '750 Cabin', '8.5 Cabin'] },
    'Marinello': { k: 'motore', m: ['Fisherman 16', 'Fisherman 18', 'Fisherman 20', 'Fisherman 22', 'Eden 20', 'Eden 22', 'Eden 26', 'Eden 28'] },
    'Mingolla': { k: 'motore', m: ['Brava 18', 'Brava 20', 'Brava 22', 'Brava 24', 'Brava 26', 'Brava 28', 'Gozzo 20'] },
    'Gobbi': { k: 'motore', m: ['Gobbi 21', 'Gobbi 225', 'Gobbi 23', 'Gobbi 245', 'Gobbi 25', 'Gobbi 255', 'Gobbi 275', 'Gobbi 30', 'Gobbi 315', 'Gobbi 345', 'Gobbi 375', 'Gobbi 425'] },
    'Sessa Marine': { k: 'motore', m: ['Key Largo 20', 'Key Largo 24', 'Key Largo 27', 'Key Largo 34', 'C35', 'C42'] },
    'Fiart Mare': { k: 'motore', m: ['Fiart 25', 'Fiart 27', 'Fiart 31 Seawalker', 'Fiart 33 Genius', 'Fiart 35 Genius', 'Fiart 38 Genius', 'Fiart 39 Seawalker', 'Fiart 40 Genius', 'Fiart 43 Seawalker', 'Fiart 44 Genius', 'Fiart 52 Seawalker'] },
    'Cranchi': { k: 'motore', m: ['E26 Rider', 'A46 Luxury Tender', 'T36 Crossover', 'M44 HT', 'Panama 40'] },
    'Salpa': { k: 'motore', m: ['Laver 21', 'Laver 23', 'Laver 26', 'Laver 30', 'Soleil 20', 'Soleil 23', 'Soleil 26', 'Salpa 25', 'Salpa 32', 'Salpa 38'] },
    'Aquamar': { k: 'motore', m: ['Aquamar 21', 'Aquamar 23', 'Aquamar 25', 'Aquamar 27'] },
    'Apreamare': { k: 'motore', m: ['Apreamare 7.5', 'Apreamare 8', 'Apreamare 9', 'Apreamare 10', 'Apreamare 12', 'Apreamare 35 Comfort', 'Apreamare 38 Comfort', 'Apreamare 45', 'Apreamare 48', 'Apreamare 54', 'Apreamare 60'] },
    'Azimut': { k: 'motore', e: 'ebD', m: ['Azimut 32', 'Azimut 32 Plus', 'Azimut 36', 'Azimut 39', 'Azimut 40', 'Azimut 42', 'Azimut 43', 'Azimut 46', 'Azimut 47', 'Azimut 50', 'Azimut 53', 'Azimut 55', 'Azimut 58', 'Azimut 62', 'Azimut 64', 'Azimut 68', 'Azimut 72', 'Azimut 78', 'Azimut 80', 'Azimut 85', 'Atlantis 34', 'Atlantis 38', 'Atlantis 39', 'Atlantis 42', 'Atlantis 43', 'Atlantis 45', 'Atlantis 47', 'Atlantis 50', 'Atlantis 51', 'Atlantis 55', 'Verve 40', 'Verve 42', 'Verve 47', 'Azimut S6', 'Azimut S7', 'Azimut S8', 'Azimut S10', 'Magellano 43', 'Magellano 50', 'Magellano 53', 'Magellano 66', 'Magellano 76', 'Grande 26M', 'Grande 27M', 'Grande 30M', 'Grande 32M', 'Grande 35M'] },
    'Ferretti Yachts': { k: 'motore', e: 'ebD', m: ['Ferretti 430', 'Ferretti 460', 'Ferretti 470', 'Ferretti 480', 'Ferretti 500', 'Ferretti 530', 'Ferretti 550', 'Ferretti 570', 'Ferretti 590', 'Ferretti 620', 'Ferretti 650', 'Ferretti 670', 'Ferretti 690', 'Ferretti 720', 'Ferretti 780', 'Ferretti 850', 'Ferretti 920', 'Ferretti 960', 'INFYNITO 80', 'INFYNITO 90'] },
    'Pershing': { k: 'motore', e: 'ebD', m: ['Pershing 37', 'Pershing 40', 'Pershing 45', 'Pershing 46', 'Pershing 50', 'Pershing 52', 'Pershing 54', 'Pershing 56', 'Pershing 62', 'Pershing 64', 'Pershing 70', 'Pershing 72', 'Pershing 74', 'Pershing 82', 'Pershing 92', 'Pershing 5X', 'Pershing 6X', 'Pershing 7X', 'Pershing 8X', 'Pershing 9X', 'Pershing GTX70', 'Pershing GTX80', 'Pershing GTX116'] },
    'Riva': { k: 'motore', e: 'ebD', m: ['Aquarama', 'Ariston', 'Tritone', 'Super Florida', 'Junior', 'Iseo', 'Aquariva', 'Rivamare', 'Dolceriva', 'Rivarama', '33 Aquariva Super', '38 Rivamare', '44 Rivarama', '48 Capri', '56 Rivale', '63 Virtus', '68 Diable', '76 Bahamas', '76 Perseo', '88 Folgore', '90 Argo', '100 Corsaro'] },
    'Absolute': { k: 'motore', e: 'ebD', m: ['Absolute 40 STL', 'Absolute 43 Coupé', 'Absolute 45 Fly', 'Absolute 47 Fly', 'Absolute 50 Fly', 'Absolute 52 Fly', 'Absolute 56 Fly', 'Absolute 58 Fly', 'Absolute 60 Fly', 'Absolute 62 Fly', 'Absolute 64 Fly', 'Absolute 70 Fly', 'Navetta 48', 'Navetta 52', 'Navetta 53', 'Navetta 58', 'Navetta 64', 'Navetta 68', 'Navetta 70', 'Navetta 73', 'Navetta 75'] },
    'Sea Ray': { k: 'motore', m: ['SPX 190', 'SPX 210', 'SPX 230', 'SDX 250', 'SDX 270', 'SDX 290', 'SLX 260', 'SLX 280', 'SLX 310', 'SLX 350', 'SLX 400', 'Sundancer 260', 'Sundancer 265', 'Sundancer 280', 'Sundancer 290', 'Sundancer 300', 'Sundancer 315', 'Sundancer 320', 'Sundancer 330', 'Sundancer 350', 'Sundancer 370', 'Sundancer 400', 'Sundancer 455', 'Sundancer 460', 'Sundancer 510', 'Sundancer 605', 'Sundancer 680', 'Fly 510', 'Fly 540', 'Fly 650'] },
    'Bayliner': { k: 'motore', m: ['Element E16', 'Element E18', 'Element E21', 'VR5', 'VR6', 'Trophy T20', 'Trophy T22'] },
    'Boston Whaler': { k: 'motore', m: ['Montauk 150', 'Montauk 170', 'Dauntless 190', 'Outrage 230', 'Vantage 230'] },
    'Parker': { k: 'motore', m: ['Parker 470', 'Parker 530', 'Parker 590', 'Parker 630', 'Parker 660', 'Parker 690', 'Parker 750', 'Parker 790', 'Parker 800', 'Parker 920', 'Parker 1000'] },
    'Pacific Craft': { k: 'motore', m: ['Pacific Craft 545', 'Pacific Craft 625', 'Pacific Craft 670', 'Pacific Craft 750', 'Pacific Craft 800'] },
    'Capelli': { k: 'gommone', m: ['Tempest 500', 'Tempest 570', 'Tempest 600', 'Tempest 625', 'Tempest 650', 'Tempest 700', 'Tempest 750', 'Tempest 775', 'Tempest 800', 'Tempest 850', 'Tempest 900', 'Tempest 1000', 'Tempest 1100', 'Cap 21', 'Cap 23', 'Cap 26', 'Cap 32'] },
    'Joker Boat': { k: 'gommone', m: ['Coaster 470', 'Coaster 520', 'Coaster 580', 'Coaster 650', 'Clubman 19', 'Clubman 21', 'Clubman 22', 'Clubman 24', 'Clubman 26', 'Clubman 28', 'Clubman 30', 'Clubman 35'] },
    'Nuova Jolly': { k: 'gommone', m: ['Prince 18', 'Prince 20', 'Prince 21', 'Prince 23', 'Prince 25', 'Prince 27', 'Prince 29', 'Prince 32', 'Prince 38', 'King 1000', 'King 1200', 'NJ 360', 'NJ 400', 'NJ 450', 'NJ 500', 'NJ 550', 'NJ 600', 'NJ 650', 'NJ 700', 'NJ 760', 'NJ 800', 'NJ 950'] },
    'BSC': { k: 'gommone', m: ['BSC 50', 'BSC 53', 'BSC 56', 'BSC 60', 'BSC 62', 'BSC 65', 'BSC 70', 'BSC 74', 'BSC 78', 'BSC 80', 'BSC 85', 'BSC 90', 'BSC 100', 'BSC 113'] },
    'Lomac': { k: 'gommone', m: ['Lomac 400', 'Lomac 460', 'Lomac 500', 'Lomac 540', 'Lomac 600', 'Lomac 660', 'Lomac 710', 'Lomac 760', 'Lomac 790', 'Lomac 880', 'Lomac 990', 'Gran Turismo 8.5', 'Gran Turismo 10.5', 'Gran Turismo 12.5'] },
    'MV Marine': { k: 'gommone', m: ['Mito 23', 'Mito 25', 'Mito 27', 'Mito 29', 'Mito 31', 'Mito 35', 'Mito 40', 'Dream 20', 'Dream 22', 'Dream 24', 'Pegaso 5.0'] },
    'Sacs': { k: 'gommone', m: ['Strider 10', 'Strider 11', 'Strider 13', 'Strider 15', 'Rebel 33', 'Rebel 40', 'Rebel 47', 'Marlin 40', 'Marlin 50', 'S 590', 'S 680', 'S 780', 'S 800'] },
    'Zodiac': { k: 'gommone', m: ['Cadet', 'Medline 5.8', 'Medline 6.8', 'Medline 7.5', 'Open 3.1', 'Open 4.2', 'Open 5.5', 'Pro 5.5', 'Pro 6.5', 'Pro 7'] },
    'Bombard': { k: 'gommone', m: ['Sunrider 390', 'Sunrider 450', 'Sunrider 500', 'Sunrider 550', 'Sunrider 650', 'Sunrider 700', 'Explorer 420', 'Explorer 500', 'Explorer 530', 'Explorer 600', 'Explorer 700', 'AX3', 'AX4'] },
    'Highfield': { k: 'gommone', m: ['Classic 260', 'Classic 310', 'Classic 340', 'Sport 520', 'Sport 560', 'Sport 660', 'Sport 800'] },
    'Bavaria': { k: 'vela', m: ['Cruiser 34', 'Cruiser 37', 'Cruiser 41', 'Cruiser 46', 'C38', 'C42', 'C45', 'C46', 'C50', 'C57'] },
    'Dufour': { k: 'vela', m: ['Dufour 360', 'Dufour 390', 'Dufour 41', 'Dufour 430', 'Dufour 470', 'Dufour 530'] },
    'Hanse': { k: 'vela', m: ['Hanse 315', 'Hanse 348', 'Hanse 388', 'Hanse 418', 'Hanse 460', 'Hanse 510'] },
    'Elan': { k: 'vela', m: ['Impression 40.1', 'Impression 43', 'Impression 45.1', 'E3', 'E4', 'E5', 'E6'] },
    'Grand Soleil': { k: 'vela', m: ['Grand Soleil 34', 'Grand Soleil 37', 'Grand Soleil 39', 'Grand Soleil 40', 'Grand Soleil 42 LC', 'Grand Soleil 43', 'Grand Soleil 44', 'Grand Soleil 46 LC', 'Grand Soleil 48', 'Grand Soleil 50', 'Grand Soleil 52 LC', 'Grand Soleil 54', 'Grand Soleil 58', 'Grand Soleil 65 LC', 'Grand Soleil 72'] },
    'Comar': { k: 'vela', m: ['Comet 33', 'Comet 38', 'Comet 41', 'Comet 45', 'Comet 50', 'Comet 52', 'Comet 62'] },
    'Solaris': { k: 'vela', m: ['Solaris 36', 'Solaris 37', 'Solaris 40', 'Solaris 42', 'Solaris 44', 'Solaris 47', 'Solaris 50', 'Solaris 55', 'Solaris 58', 'Solaris 60', 'Solaris 64', 'Solaris 72', 'Solaris 80'] },
    'X-Yachts': { k: 'vela', m: ['X-35', 'X-37', 'X-41', 'X-43', 'Xp 38', 'Xp 44', 'Xp 50', 'Xc 38', 'Xc 42', 'Xc 45', 'Xc 50', 'X4.0', 'X4.3', 'X4.6', 'X4.9', 'X5.6'] },
    'Dehler': { k: 'vela', m: ['Dehler 30 OD', 'Dehler 34', 'Dehler 38', 'Dehler 42', 'Dehler 46'] },
    'Lagoon': { k: 'vela', m: ['Lagoon 40', 'Lagoon 42', 'Lagoon 46', 'Lagoon 51', 'Lagoon 55'] },
    'Fountaine Pajot': { k: 'vela', m: ['Lucia 40', 'Isla 40', 'Astrea 42', 'Saona 47', 'Tanna 47', 'Elba 45', 'Aura 51', 'Samana 59', 'Alegria 67', 'Lipari 41', 'Helia 44', 'Ipanema 58', 'MY 40', 'MY 44', 'MY 6'] },
    'Sea-Doo': { k: 'moto', m: ['Spark', 'Spark Trixx', 'GTI', 'GTI SE', 'GTR', 'Wake', 'GTX', 'RXP-X', 'RXT-X', 'Explorer Pro', 'FishPro'] },
    'Yamaha WaveRunner': { k: 'moto', m: ['JetBlaster', 'EX', 'VX', 'VX Cruiser', 'GP HO', 'GP SVHO', 'FX HO', 'FX Cruiser SVHO'] },
    'Kawasaki': { k: 'moto', m: ['Jet Ski STX 160', 'Jet Ski Ultra 310', 'Jet Ski SX-R'] }
  },
  motori: {
    'Yamaha': {
      fb4: ['F2.5', 'F4', 'F5', 'F6', 'F8', 'F9.9', 'F15', 'F20', 'F25', 'F30', 'F40', 'F50', 'F60', 'F70', 'F80', 'F90', 'F100', 'F115', 'F130', 'F150', 'F175', 'F200', 'F225', 'F250', 'F300', 'F350', 'XTO 425', 'XTO 450'],
      fb2: ['2CMHS', 'Enduro E15', 'Enduro E25', 'Enduro E40', 'Enduro E75']
    },
    'Mercury': {
      fb4: ['2.5', '3.5', '4', '5', '6', '8', '9.9', '15', '20', '25', '30', '40', '50', '60', '75', '80', '90', '100', '115', '115 Pro XS', '150', '150 Pro XS', '175', '200', '225', '250', 'Verado 250', 'Verado 300', 'Verado 350', 'Verado 400', 'Verado 600'],
      el: ['Avator 7.5e', 'Avator 20e', 'Avator 35e']
    },
    'MerCruiser': { efbB: ['3.0L', '4.5L V6 250', '6.2L 300', '6.2L 350'] },
    'Suzuki': { fb4: ['DF2.5', 'DF4A', 'DF6A', 'DF9.9B', 'DF15A', 'DF20A', 'DF25A', 'DF30A', 'DF40A', 'DF50A', 'DF60A', 'DF70A', 'DF80A', 'DF90A', 'DF100B', 'DF115B', 'DF140B', 'DF150AP', 'DF175AP', 'DF200A', 'DF250AP', 'DF300B', 'DF350A'] },
    'Honda': { fb4: ['BF2.3', 'BF5', 'BF6', 'BF8', 'BF10', 'BF15', 'BF20', 'BF30', 'BF40', 'BF50', 'BF60', 'BF80', 'BF90', 'BF100', 'BF115', 'BF135', 'BF150', 'BF200', 'BF225', 'BF250', 'BF350'] },
    'Tohatsu': { fb4: ['MFS2.5', 'MFS3.5', 'MFS5', 'MFS6', 'MFS9.9', 'MFS15', 'MFS20', 'MFS30', 'MFS40', 'MFS50', 'MFS60', 'MFS90', 'MFS115', 'MFS140'], fb2: ['M3.5', 'M5', 'M9.8', 'M18', 'M25', 'M30'] },
    'Selva': { fb4: ['Naxos 2.5', 'Naxos 4', 'Naxos 5', 'Naxos 6', 'Spider 9.9', 'Spider 15', 'Spider 20', 'Fox 25', 'Dorado 40', 'Dorado 50', 'Dorado 60', 'Marlin 100', 'Killer Whale 115', 'Killer Whale 150', 'Black Fin 200', 'Black Fin 225'], fb2: ['Naxos 5 2T', 'Piranha 9.9', 'Barracuda 25', 'Dorado 40 2T'] },
    'Evinrude': { fb2: ['E-TEC 25', 'E-TEC 30', 'E-TEC 40', 'E-TEC 60', 'E-TEC 90', 'E-TEC 115', 'E-TEC 150', 'E-TEC G2 150', 'E-TEC G2 200', 'E-TEC G2 250', 'E-TEC G2 300'] },
    'Johnson': { fb2: ['2', '4', '6', '8', '9.9', '15', '25', '30', '40', '50', '60', '70', '90', '115', '140', '150', '175', '200'] },
    'Parsun': { fb4: ['F2.6', 'F5', 'F6', 'F9.9', 'F15', 'F20', 'F25', 'F30', 'F40', 'F50', 'F60', 'F75', 'F90', 'F100', 'F115'], fb2: ['T2.6', 'T5', 'T9.8', 'T15', 'T30', 'T40'] },
    'Hidea': { fb4: ['HDF2.5', 'HDF5', 'HDF6', 'HDF9.9', 'HDF15', 'HDF20', 'HDF30', 'HDF40', 'HDF60', 'HDF115'], fb2: ['HD5', 'HD9.8', 'HD15', 'HD30', 'HD40'] },
    'Volvo Penta': {
      ebD: ['D1-13', 'D1-20', 'D1-30', 'D2-40', 'D2-50', 'D2-55', 'D2-60', 'D2-75', 'D3-150', 'D3-220', 'D4-270', 'D4-320', 'D6-380', 'D6-440', 'IPS 400', 'IPS 600', 'IPS 800',
        'MD2010', 'MD2020', 'MD2030', 'MD2040', 'MD22', 'TMD22', 'TAMD22', 'TMD31', 'TAMD31', 'TMD41', 'TAMD41', 'TAMD42', 'KAMD43', 'KAMD44', 'KAMD300',
        'TAMD61', 'TAMD63', 'TAMD71', 'TAMD72', 'TAMD73', 'TAMD74', 'TAMD75'],
      efbD: ['D3-220 DP', 'D4-320 DP', 'D6-440 DP', 'AD31', 'AD41', 'KAD32', 'KAD42', 'KAD43', 'KAD44', 'KAD300', 'AQAD41'],
      efbB: ['V6-200', 'V6-240', 'V6-280', 'V8-300', 'V8-350', 'V8-380', 'V8-430', 'AQ125', 'AQ131', 'AQ145', 'AQ151', 'AQ171', '4.3 GL', '4.3 GXi', '5.0 GL', '5.0 GXi', '5.7 GL', '5.7 GXi'],
      ebB: ['5.0 OSi', '5.7 OSi']
    },
    'Yanmar': { ebD: ['1GM10', '2YM15', '3YM20', '3YM30', '3JH5E', '4JH45', '4JH57', '4JH80', '4JH110', '6BY', '6LY'], efbD: ['8LV'] },
    'Nanni': { ebD: ['N2.10', 'N2.14', 'N3.21', 'N3.30', 'N4.38', 'N4.40', 'N4.50', 'N4.60', 'N4.65', 'N4.85', 'N4.115', 'N5.135', 'N6.200', 'N6.285', 'N9.500', 'T4.165', 'T4.180'] },
    'Vetus': { ebD: ['M2.06', 'M2.13', 'M2.18', 'M3.10', 'M3.29', 'M4.15', 'M4.17', 'M4.35', 'M4.45', 'M4.56', 'VH4.65', 'VH4.80', 'VF4.140', 'VF4.170', 'VF5.250'] },
    'Perkins': { ebD: ['Prima M50', 'Prima M60', 'Prima M80T', 'M92B', 'M130C', 'M135', 'M185C', 'M215C', 'M225Ti', 'M265Ti', 'M300Ti', '4.108', '4.236', '6.354'] },
    'Cummins': { ebD: ['4BTA 3.9', '6BTA 5.9', 'QSD 2.8', 'QSD 4.2', 'QSB 5.9', 'QSB 6.7', 'QSC 8.3', 'QSL 9', 'QSM11', 'X15'] },
    'Caterpillar': { ebD: ['3116', '3126', '3208', 'C7', 'C9', 'C12', 'C18', 'C32'] },
    'MAN': { ebD: ['i6-730', 'i6-800', 'i6-850', 'V8-1000', 'V8-1200', 'V12-1400', 'V12-1550', 'V12-1650', 'V12-1800', 'V12-1900', 'V12-2000'] },
    'FPT': { ebD: ['N40 220', 'N40 250', 'N67 280', 'N67 450', 'N67 560', 'C90 650', 'C13 600', 'C13 825', 'C16 1000'] },
    'Lombardini Marine': { ebD: ['LDW 502M', 'LDW 702M', 'LDW 1003M', 'LDW 1404M', 'LDW 2004M', 'LDW 2204M'] },
    'Torqeedo': { el: ['Ultralight 403', 'Travel 603', 'Travel 1103', 'Cruise 3.0', 'Cruise 6.0', 'Cruise 12.0', 'Deep Blue'] },
    'ePropulsion': { el: ['Spirit 1.0 Plus', 'Navy 3.0 Evo', 'Navy 6.0 Evo', 'X12', 'X20'] },
    'Sea-Doo (Rotax)': { moto: ['Rotax 900 ACE', 'Rotax 1630 ACE'] },
    'Yamaha (moto d\'acqua)': { moto: ['TR-1', 'SVHO 1.9'] },
    'Kawasaki (moto d\'acqua)': { moto: ['1498 cc'] }
  },
  /* Potenza (CV) dei modelli il cui nome non la contiene; per gli altri la ricava checklist.js dal nome
     (F150, DF140, D4-300, V8-350...). Chiave: modello in minuscolo senza spazi e trattini. Dati indicativi: fa fede il libretto. */
  potenze: {
    'Volvo Penta': { tamd41: 200, ad41: 200, kad32: 170, kad43: 230, kamd43: 230, kad44: 260, kamd44: 260, kad300: 285, kamd300: 285,
      md2010: 10, md2020: 18, md2030: 29, md2040: 38, d113: 13, d120: 20, d130: 30, ips400: 300, ips600: 435, ips800: 600 }
  },
  /* Programmi di manutenzione presi dal libretto del costruttore, per i motori di cui è stato controllato.
     re: espressione sul modello (minuscolo, senza spazi); marchio: parte del nome del marchio.
     man: [voce, ore, mesi, con, senza, solo i modelli che corrispondono a] (con/senza come in checklist.js: efb = con piede) */
  profili: [
    {
      id: 'vp-41', marchio: 'volvo', re: '^(tmd|tamd|kamd|ad|kad)(31|32|41|42|43)',
      nome: 'Volvo Penta serie 31, 32, 41, 42, 43',
      fonte: 'Libretto di istruzioni Volvo Penta KAD32, valido anche per TMD31, TAMD31, AD31, AD41, TMD41, TAMD41, TAMD42, KAD43 e KAMD43 (programma di manutenzione, pag. 31)',
      url: 'https://www.manualslib.com/manual/3383574/Volvo-Penta-Kad32.html?page=31',
      pre: ['Ogni 14 giorni: scarico dell\'acqua dai filtri del gasolio, cinghie, filtro dell\'acqua di mare, livello dell\'olio dell\'invertitore e dello sterzo'],
      man: [
        ['Olio motore e filtro dell\'olio', 100, 12],
        ['Compressore: livello dell\'olio', 100, 12, null, null, '^ka'],
        ['Cuscinetto dello sterzo del piede DP: ingrassaggio', 50, 12, 'efb'],
        ['Filtro dell\'aria: sostituzione', 200, 12],
        ['Cinghie: controllo', 200, 12],
        ['Filtro di ventilazione del basamento (se presente)', 200, 12],
        ['Filtri del gasolio e prefiltro: sostituzione', 200, 12],
        ['Girante della pompa dell\'acqua di mare: controllo', 200, 12],
        ['Impianto di scarico: controllo', 200, 12],
        ['Olio dell\'invertitore: sostituzione', 200, 12, null, 'efb'],
        ['Olio del piede: sostituzione', 200, 12, 'efb'],
        ['Giunto omocinetico e soffietto di scarico del piede: controllo', 200, 12, 'efb'],
        ['Gioco delle valvole: regolazione (di solito in officina)', 200, null],
        ['Turbocompressore: controllo (di solito in officina)', 200, null],
        ['Liquido di raffreddamento: ogni 2 anni con antigelo, ogni anno se c\'è solo anticorrosivo', null, 24],
        ['Giunto cardanico e soffietto di scarico del piede: sostituzione', null, 24, 'efb'],
        ['Tenuta dell\'asse dell\'elica dell\'invertitore: sostituzione', 500, 60, null, 'efb']
      ]
    }
  ]
};
