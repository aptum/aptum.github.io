#!/usr/bin/php -q
<?php

/* call with -d to debug */
$cmd_list=arguments( $argv );

if (!isset($cmd_list)) {
   //logtrace(1,"Called without arguments");
   $no_args=1;
}

if (isset($cmd_list['d']) && $cmd_list['d']==1 && $no_args!=1) {
   logtrace(1,"Debug mode");
   $debug=true;
   // does nothing atm
}

$Verbose=4;
# Connect to PostgreSQL database
$conn = pg_pconnect("dbname='grb' user='grb-data' password='snowball11..' host='localhost'");
if (!$conn) {
    echo json_encode(pg_last_error());
    //echo "Not connected : " . pg_error();
    exit;
}

// CREATE EXTENSION IF NOT EXISTS plpgsql WITH SCHEMA pg_catalog;

/* table templates */
$create_streets_seq=<<<EOD
CREATE SEQUENCE streets_item_id_seq
START WITH 0
INCREMENT BY 1
MINVALUE 0
NO MAXVALUE
CACHE 1;
EOD;

$create_addresses_seq=<<<EOD
CREATE SEQUENCE addresses_item_id_seq
START WITH 0
INCREMENT BY 1
MINVALUE 0
NO MAXVALUE
CACHE 1;
EOD;

$create_streets=<<<EOD
CREATE TABLE streets (
id INTEGER DEFAULT nextval('streets_item_id_seq'::regclass),
postcode int NOT NULL,
sname text NOT NULL,
fname text NOT NULL,
map_date timestamp without time zone NOT NULL default current_timestamp
);
EOD;

$create_geos=<<<EOD
SELECT AddGeometryColumn('addresses', 'coord', 4326, 'POINT', 2);
EOD;


$index_streets=<<<EOD
CREATE INDEX idx_pc_sn ON streets (postcode, sname);
EOD;

$create_addresses=<<<EOD
CREATE TABLE addresses (
id INTEGER DEFAULT nextval('addresses_item_id_seq'::regclass),
sname text,
app_nr text DEFAULT NULL,
bus_nr text DEFAULT NULL,
house_nr text DEFAULT NULL,
map_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
EOD;

// SELECT AddGeometryColumn('addresses', 'coord', 4326, 'POINT', 'XY');
$create_adresses_geos=<<<EOD
SELECT AddGeometryColumn('addresses', 'coord', 4326, 'POINT', 2);
CREATE INDEX addresses_coord_gix ON addresses USING GIST (coord);
EOD;

$create_filemap=<<<EOD
CREATE TABLE filemap (
postcode int NOT NULL,
path text NOT NULL,
map_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
PRIMARY KEY (postcode,path)
);
EOD;

$insert_filemap=<<<EOD
INSERT INTO filemap VALUES (%s, '%s', CURRENT_TIMESTAMP);
EOD;

$insert_streets=<<<EOD
INSERT INTO streets (postcode, sname, fname, map_date) VALUES ( %d, '%s', '%s', CURRENT_TIMESTAMP);
EOD;


$select_filemaps=<<<EOD
SELECT * FROM filemap where postcode='%s';
EOD;

$select_streets=<<<EOD
SELECT * FROM streets where postcode='%s';
EOD;

$select_all_streets=<<<EOD
SELECT * FROM streets order by postcode;
EOD;

$select_some_streets=<<<EOD
SELECT * FROM streets where postcode='%s' AND sname IN (%s);
EOD;

$select_allfilemaps=<<<EOD
SELECT * FROM filemap;
EOD;

$select_filemap=<<<EOD
SELECT * FROM filemap WHERE postcode='%s';
EOD;

$exists_table=<<<EOD
SELECT EXISTS(
    SELECT * 
    FROM information_schema.tables 
    WHERE 
      table_schema = 'public' AND 
      table_name = '%s'
) AS table_exists;
EOD;

$rs = pg_query($conn, sprintf($exists_table, 'filemap'));
if (!$rs) {
    logtrace(0,"Error : " . pg_result_error($conn));
    exit;
} else {
    $arr = pg_fetch_array($rs, NULL, PGSQL_ASSOC);
    pg_free_result($rs);
}

if ($arr['table_exists'] == 'f') {
    $rs = pg_query($conn, $create_filemap);
    if (!$rs) {
        logtrace(0,"Error : " . pg_result_error($conn));
        exit;
    } else {
        logtrace(0,"Sucess : created table ");
        pg_free_result($rs);
    }
}

$rs = pg_query($conn, sprintf($exists_table, 'streets'));
if (!$rs) {
    logtrace(0,"Error : " . pg_result_error($conn));
    exit;
} else {
    $arr = pg_fetch_array($rs, NULL, PGSQL_ASSOC);
    pg_free_result($rs);
}

if ($arr['table_exists'] == 'f') {
    $rs = pg_query($conn, $create_streets_seq);
    $rs = pg_query($conn, $create_streets);
    if (!$rs) {
        logtrace(0,"Error : " . pg_result_error($conn));
        exit;
    } else {
        logtrace(0,"Sucess : created table ");
        pg_free_result($rs);
    }
}

$rs = pg_query($conn, sprintf($exists_table, 'addresses'));
if (!$rs) {
    logtrace(0,"Error : " . pg_result_error($conn));
    exit;
} else {
    $arr = pg_fetch_array($rs, NULL, PGSQL_ASSOC);
    pg_free_result($rs);
}

if ($arr['table_exists'] == 'f') {
    $rs = pg_query($conn, $create_addresses_seq);
    $rs = pg_query($conn, $create_addresses);
    if (!$rs) {
        logtrace(0,"Error : " . pg_result_error($conn));
        exit;
    } else {
        logtrace(0,"Sucess : created table ");
        pg_free_result($rs);
        $rs = pg_query($conn, $create_geos);
    }
}

$postcodes_index_path = sprintf("%s","/var/www/aptum/data/");
$file_list = bfglob($postcodes_index_path,'*.json',0,0);
$known_filemaps=array();
/*
logtrace(3,sprintf("Found %d file(s)",count($file_list)));
if (count($file_list)) {
    pg_query($conn, "BEGIN;");
    $qr="";
    foreach($file_list as $file) {
        $postcode=basename($file, ".json");
        if (!in_array($file, $known_filemaps)) {
            logtrace(5,sprintf("Storing path %s for postcode %s",$file, $postcode));
            $qr.=sprintf($insert_filemap, $postcode, $file);
        } else {
            logtrace(1,sprintf("Not storing known path %s for postcode %s",$file, $postcode));
        }
    }
    $rs = pg_query($conn, $qr);
    if (!$rs) {
        logtrace(0,"Error : " . pg_result_error($conn));
        exit();
    } else {
        pg_query($conn, "COMMIT;");
    }
}
*/

$known=getMaps($conn);
//print_r($known);
//exit;
//print_r($known);
$known_filemaps=array_value_recursive('path', $known);
// print_r($known_filemaps);

foreach ($known_filemaps as $fname) {
    $string = file_get_contents($fname);
    $json_a = json_decode($string, true);
    //print_r($json_a);exit;

    if (!empty($json_a['streets'])) {
        pg_query($conn, "BEGIN;");
        foreach ($json_a['streets'] as $k => $v) {
            $qr=sprintf($insert_streets, basename($fname,'.json'), pg_escape_string($conn,$v['name']), pg_escape_string($conn,$v['sanName']));
            logtrace(5,sprintf($qr));
            logtrace(5,sprintf("\"%s\" from file '%s'",pg_escape_string($conn, $v['name']), pg_escape_string($conn,$v['sanName'])));
            $rs = pg_query($conn, $qr);
            if (!$rs) {
                logtrace(0,"Error : " . pg_result_error($conn));
                logtrace(0,"record : " . print_r($v,true));
                logtrace(0,"qry : " . $qr);
                pg_query($conn, "ROLLBACK;");
                exit;
            }
        }
        pg_query($conn, "COMMIT;");
    }
}

$known=getStreets($conn);
logtrace(1, sprintf("[%s] Count %d",__FUNCTION__, count($known)));

# this time we'll use a Prepared Statement
$qry = sprintf("INSERT INTO addresses ( sname, app_nr, bus_nr, house_nr, coord) VALUES ( $1, $2, $3 , $4, GeomFromText($5, 4326))");
logtrace(3,sprintf("[%d] - Preparing %s",0, $qry));
$rs = pg_prepare($conn, 'ins_addresses', $qry );
if (!$rs) {
    logtrace(0,"Error : " . pg_last_error($conn));
    return($results);
}
$changes=0;
foreach ($known as $k => $file) {
    $filename = $postcodes_index_path.$file['postcode']."/".$file['fname'].".json";
    if (!($k % 500)) {
        logtrace(3,sprintf("[%d] - Parsing %s file",$k , $filename));
    }
    $string = file_get_contents($filename);
    $json_a = json_decode($string, true);
    // print_r($json_a);exit;

	if (count($json_a) && array_key_exists('addresses', $json_a)) {
		if (!($changes % 1000)) {
			logtrace(3,sprintf("[%d] - %d addresses in %s",__METHOD__,count($json_a['addresses']) , $file['postcode']));
			//logtrace(3,sprintf("[] - Binding vars to qry"));
		}

		//var_Dump($json_a);
		//print_r($json_a);
		$json_a = $json_a['addresses'];
        pg_query($conn, "BEGIN;");
		//$stmt->reset();
		//$stmt->clear();
		try {
			foreach($json_a as $key => $this_address) {
				// $qry = sprintf("INSERT INTO addresses ( sname, bus_nr, house_nr, coord)  VALUES ( ?, ?, GeomFromText('POINT(? ?)', 4326))", $file['sname'], json_encode($file['busnrs']), json_encode($file['hnrlbls']),  $file['lat'], $file['lon']);
				//$stmt->bindValue(1, $file['sname'], SQLITE3_TEXT);
				//$stmt->bindValue(2, (isset($this_address['apptnrs']) ? json_encode($this_address['apptnrs']) : NULL ) , SQLITE3_TEXT);
				//$stmt->bindValue(3, (isset($this_address['busnrs']) ? json_encode($this_address['busnrs']) : NULL ) , SQLITE3_TEXT);
				//$stmt->bindValue(4, (isset($this_address['hnrlbls']) ? json_encode($this_address['hnrlbls']) : NULL ) , SQLITE3_TEXT);
				//$stmt->bindValue(5, sprintf("POINT(%s %s)", $this_address['lon'],$this_address['lat']), SQLITE3_TEXT);
                $ins_array = array ($file['sname'], (isset($this_address['apptnrs']) ? json_encode($this_address['apptnrs']) : NULL ), (isset($this_address['busnrs']) ? json_encode($this_address['busnrs']) : NULL ) , (isset($this_address['hnrlbls']) ? json_encode($this_address['hnrlbls']) : NULL ), sprintf("POINT(%s %s)", $this_address['lon'],$this_address['lat']));
                $result = pg_execute($conn, "ins_addresses",$ins_array);
				//logtrace(3,sprintf("[] - Committing"));
				$changes+=pg_affected_rows($result);
			} 
            pg_query($conn, "COMMIT;");
		}
		catch(Exception $ex) { 
			logtrace(0, sprintf("[%s] - %s",__FUNCTION__,pg_last_error()));
			logtrace(0, sprintf("[%s] - %s",__FUNCTION__,$ex->getMessage()));
            pg_query($conn, "ROLLBACK;");
			exit; 
		}
	}
}
logtrace(0, sprintf("[%s] - inserted addresses = %d",__FUNCTION__,$changes));
    /*
sname varchar(255) NOT NULL,
house_address varchar(255) NOT NULL,
bus_nr varchar(255) NOT NULL,
house_nr varchar(255) NOT NULL,
map_date timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,

   {
      "busnrs": [
        "1",
        "2",
        "3",
        "4"
      ],
      "hnrlbls": [
        "100"
      ],
      "housenumber": "100",
      "lat": 50.97467359648,
      "lon": 4.468016210346,
      "municipality": "Zemst",
      "pcode": "1982",
      "source": "afgeleidVanGebouw",
      "street": "Damstraat"
    },
*/
//$known_streetmaps=array_value_recursive('path', $known);

unset($db);

exit;

# reporting some version info
$rs = $db->query('SELECT sqlite_version()');
while ($row = $rs->fetchArray()) {
  logtrace(2, "SQLite version: $row[0]");
}
$rs = $db->query('SELECT spatialite_version()');
while ($row = $rs->fetchArray()) {
  logtrace(2, "SpatiaLite version: $row[0]");
}


# creating a POINT table
$sql = "CREATE TABLE test_pt (";
$sql .= "id INTEGER NOT NULL PRIMARY KEY,";
$sql .= "name TEXT NOT NULL)";
$db->exec($sql);
# creating a POINT Geometry column
$sql = "SELECT AddGeometryColumn('test_pt', ";
$sql .= "'geom', 4326, 'POINT', 'XY')";
$db->exec($sql);

# creating a LINESTRING table
$sql = "CREATE TABLE test_ln (";
$sql .= "id INTEGER NOT NULL PRIMARY KEY,";
$sql .= "name TEXT NOT NULL)";
$db->exec($sql);
# creating a LINESTRING Geometry column
$sql = "SELECT AddGeometryColumn('test_ln', ";
$sql .= "'geom', 4326, 'LINESTRING', 'XY')";
$db->exec($sql);

# creating a POLYGON table
$sql = "CREATE TABLE test_pg (";
$sql .= "id INTEGER NOT NULL PRIMARY KEY,";
$sql .= "name TEXT NOT NULL)";
$db->exec($sql);
# creating a POLYGON Geometry column
$sql = "SELECT AddGeometryColumn('test_pg', ";
$sql .= "'geom', 4326, 'POLYGON', 'XY')";
$db->exec($sql);

# inserting some POINTs
# please note well: SQLite is ACID and Transactional
# so (to get best performance) the whole insert cycle
# will be handled as a single TRANSACTION
$db->exec("BEGIN");
for ($i = 0; $i < 10000; $i++)
{
  # for POINTs we'll use full text sql statements
  $sql = "INSERT INTO test_pt (id, name, geom) VALUES (";
  $sql .= $i + 1;
  $sql .= ", 'test POINT #";
  $sql .= $i + 1;
  $sql .= "', GeomFromText('POINT(";
  $sql .= $i / 1000.0;
  $sql .= " ";
  $sql .= $i / 1000.0;
  $sql .= ")', 4326))";
  $db->exec($sql);
}
$db->exec("COMMIT");

# checking POINTs
$sql = "SELECT DISTINCT Count(*), ST_GeometryType(geom), ";
$sql .= "ST_Srid(geom) FROM test_pt";
$rs = $db->query($sql);
while ($row = $rs->fetchArray())
{
  # read the result set
  $msg = "Inserted ";
  $msg .= $row[0];
  $msg .= " entities of type ";
  $msg .= $row[1];
  $msg .= " SRID=";
  $msg .= $row[2];
  print "<h3>$msg</h3>";
}

# inserting some LINESTRINGs
# this time we'll use a Prepared Statement
$sql = "INSERT INTO test_ln (id, name, geom) ";
$sql .= "VALUES (?, ?, GeomFromText(?, 4326))";
$stmt = $db->prepare($sql);
$db->exec("BEGIN");
for ($i = 0; $i < 10000; $i++)
{
  # setting up values / binding
  $name = "test LINESTRING #";
  $name .= $i + 1;
  $geom = "LINESTRING(";
  if (($i%2) == 1)
  {
    # odd row: five points
    $geom .= "-180.0 -90.0, ";
    $geom .= -10.0 - ($i / 1000.0);
    $geom .= " ";
    $geom .= -10.0 - ($i / 1000.0);
    $geom .= ", ";
    $geom .= -10.0 - ($i / 1000.0);
    $geom .= " ";
    $geom .= 10.0 + ($i / 1000.0);
    $geom .= ", ";
    $geom .= 10.0 + ($i / 1000.0);
    $geom .= " ";
    $geom .= 10.0 + ($i / 1000.0);
    $geom .= ", 180.0 90.0";
  }
  else
  {
    # even row: two points
    $geom .= -10.0 - ($i / 1000.0);
    $geom .= " ";
    $geom .= -10.0 - ($i / 1000.0);
    $geom .= ", ";
    $geom .= 10.0 + ($i / 1000.0);
    $geom .= " ";
    $geom .= 10.0 + ($i / 1000.0);
  }
  $geom .= ")";

  $stmt->reset();
  $stmt->clear();
  $stmt->bindValue(1, $i+1, SQLITE3_INTEGER);
  $stmt->bindValue(2, $name, SQLITE3_TEXT);
  $stmt->bindValue(3, $geom, SQLITE3_TEXT);
  $stmt->execute();
}
$db->exec("COMMIT");

# checking LINESTRINGs
$sql = "SELECT DISTINCT Count(*), ST_GeometryType(geom), ";
$sql .= "ST_Srid(geom) FROM test_ln";
$rs = $db->query($sql);
while ($row = $rs->fetchArray())
{
  # read the result set
  $msg = "Inserted ";
  $msg .= $row[0];
  $msg .= " entities of type ";
  $msg .= $row[1];
  $msg .= " SRID=";
  $msg .= $row[2];
  print "<h3>$msg</h3>";
}

# insering some POLYGONs
# this time too we'll use a Prepared Statement
$sql = "INSERT INTO test_pg (id, name, geom) ";
$sql .= "VALUES (?, ?, GeomFromText(?, 4326))";
$stmt = $db->prepare($sql);
$db->exec("BEGIN");
for ($i = 0; $i < 10000; $i++)
{
  # setting up values / binding
  $name = "test POLYGON #";
  $name .= $i + 1;
  $geom = "POLYGON((";
  $geom .= -10.0 - ($i / 1000.0);
  $geom .= " ";
  $geom .= -10.0 - ($i / 1000.0);
  $geom .= ", ";
  $geom .= 10.0 + ($i / 1000.0);
  $geom .= " ";
  $geom .= -10.0 - ($i / 1000.0);
  $geom .= ", ";
  $geom .= 10.0 + ($i / 1000.0);
  $geom .= " ";
  $geom .= 10.0 + ($i / 1000.0);
  $geom .= ", ";
  $geom .= -10.0 - ($i / 1000.0);
  $geom .= " ";
  $geom .= 10.0 + ($i / 1000.0);
  $geom .= ", ";
  $geom .= -10.0 - ($i / 1000.0);
  $geom .= " ";
  $geom .= -10.0 - ($i / 1000.0);
  $geom .= "))";

  $stmt->reset();
  $stmt->clear();
  $stmt->bindValue(1, $i+1, SQLITE3_INTEGER);
  $stmt->bindValue(2, $name, SQLITE3_TEXT);
  $stmt->bindValue(3, $geom, SQLITE3_TEXT);
  $stmt->execute();
}
$db->exec("COMMIT");

# checking POLYGONs
$sql = "SELECT DISTINCT Count(*), ST_GeometryType(geom), ";
$sql .= "ST_Srid(geom) FROM test_pg";
$rs = $db->query($sql);
while ($row = $rs->fetchArray())
{
  # read the result set
  $msg = "Inserted ";
  $msg .= $row[0];
  $msg .= " entities of type ";
  $msg .= $row[1];
  $msg .= " SRID=";
  $msg .= $row[2];
  print "<h3>$msg</h3>";
}

# closing the DB connection
$db->close();

function open_db(&$db, $database="", $table="", $create_query="", $extra_query="")  {
    logtrace(3, sprintf("[%s] - Start",__FUNCTION__));
    /* so we all understand,   $table = $database minus the path; */
    /* avoid crap */

    $return = 0;
    if (isset($database) and isset($table)) {
        if (strlen($database)<=0 or strlen($table)<=0) {
            logtrace(2, sprintf("[%s] - Check content of parameters",__FUNCTION__));
            return($return);
        }
    } else {
        logtrace(0, sprintf("[%s] - Missing parameters",__FUNCTION__));
        return($return);
    }

    logtrace(2, sprintf("[%s] - Trying to open sqlite DB %s",__FUNCTION__,$database));

    /* if already open, don't reopen 

       sqlite> PRAGMA table_info(filemap)
       ...> ;
       0|postcode|int|1||1
       1|path|varchar(255)|1||2
       2|map_date|timestamp|1|CURRENT_TIMESTAMP|0
       sqlite> PRAGMA table_info(filemap);
       0|postcode|int|1||1
       1|path|varchar(255)|1||2
       2|map_date|timestamp|1|CURRENT_TIMESTAMP|0
       sqlite> PRAGMA database_list;
       0|main|/var/www/aptum/aptum/agiv.sqlite
       sqlite> 
     */

    $db_ok = false;
    if($db) {
        /* test to see if we have this DB open */
        $rows=0;
        logtrace(1, sprintf("[%s] Pragma check",__FUNCTION__));
        $q = $db->query(sprintf("PRAGMA database_list"));
        while ($row = $q->fetchArray(SQLITE3_ASSOC)) {
            $rs = $row;
            $rows++;
            logtrace(5, sprintf("[%s] - : %s",__FUNCTION__,print_r($row,true)));
        }
        logtrace(1, sprintf("[%s] Count %d",__FUNCTION__, $rows));
        logtrace(1, sprintf("[%s] %s",__FUNCTION__, json_encode($rs)));

        if ($rows > 0) {
            logtrace(1, sprintf("[%s] check %s vs %s",__FUNCTION__, $rs['file'], $database));
            if ((strcmp($rs['file'], $database) === 0 ) || ( $rs['seq'] == 0 && $rs['name'] == 'main')) {
                logtrace(1, sprintf("[%s] - Already have this DB open : %s",__FUNCTION__,$database));
                $db_ok  = true;
            }
        }
    }

    if (!$db_ok) { $db = new SQLite3($database, SQLITE3_OPEN_READWRITE | SQLITE3_OPEN_CREATE); }

    // var_dump($db);exit;

    # loading SpatiaLite as an extension
    if (!$db_ok) { $db->enableExceptions(true); }
    if (!$db_ok) { $db->loadExtension('libspatialite.so'); }

    # enabling Spatial Metadata
    # using v.2.4.0 this automatically initializes SPATIAL_REF_SYS
    # and GEOMETRY_COLUMNS
    if (!$db_ok) { $db->exec("SELECT InitSpatialMetadata()"); }

    $db->busyTimeout(7000); // 7 seconds

    if(!$db) {
        logtrace(0, sprintf("[%s] - Problem opening DB %s",__FUNCTION__,$database));
        logtrace(0, $err);
	    exit;
    }

    logtrace(2, sprintf("[%s] - Opened %s",__FUNCTION__,$database));
    /*
       logtrace(1,sprintf("Problem with qry : %s",$db->lastErrorMsg()));
     */

    /* test for table inside DB */
    $rows=0;
    $q = @$db->query(sprintf("PRAGMA table_info(%s)",$table));
    while ($row = $q->fetchArray(SQLITE3_ASSOC)) {
        $rs[] = $row;
        $rows++;
    }

    if ($rows < 3) {
        logtrace(1, sprintf("[%s] - table pragma check: Rows %s",__FUNCTION__, $rows ));
        if(strlen($create_query)>0) {
			logtrace(1, sprintf("[%s] - Creating table %s",__FUNCTION__,$table));
            logtrace(2, sprintf("[%s] - Query %s",__FUNCTION__,sprintf($create_query, $table)));
            if(!$db->exec(sprintf($create_query, $table))){
                logtrace(0,sprintf("[%s] - Failed to create table %s",__FUNCTION__,$table));
                logtrace(0,sprintf("%s",$create_query));
                exit;
            } else {
                logtrace(2,sprintf("[%s] - Table %s created.",__FUNCTION__,$table));
                if(!empty($extra_query)) {
                    // sprintf($extra, $table);
                    /*

                       2012-09-23 00:45:22 [10040]:[1]core  - [open_db] - Creating extras:( CREATE INDEX idx_cmb_ss_range ON %s(imei, gps_date, raw_data);
                       CREATE INDEX idx_si_gps_date ON %s(gps_date); ) on Event_arcelormittal_all
                       PHP Notice:  Undefined variable: extra in /opt/strac/serv_track_slite_light.php on line 3716
                       PHP Warning:  SQLiteDatabase::exec(): Cannot execute empty query. in /opt/strac/serv_track_slite_light.php on line 3716

                     */
                    if (!empty($extra_query)) {
                        if (!is_array($extra_query)) {
                            $ex=array();
                            $ex[]=$extra_query;
                            $extra_query=$ex;
                        }
                        foreach($extra_query as $extra) {
                            if(!$db->exec($extra)){
                                logtrace(0, sprintf("[%s] - Problem creating extras %s",__FUNCTION__,$extra));
                                logtrace(0, sprintf("[%s] - %s",__FUNCTION__,$db->lastErrorMsg()));
                                exit;
                            } else {
                                logtrace(1, sprintf("[%s] - Created extras: %s",__FUNCTION__,$extra));
                            }
                        }
                    }
                }
                $return=1;
            }
        } else {
            logtrace(0,sprintf("[%s] - Missing create query for table %s.",__FUNCTION__,$table));
        }
    } else {
        logtrace(2, sprintf("[%s] - table %s exist already",__FUNCTION__,$table));
        $return=1;
        // $result = $q->fetchSingle();
    }
    return($return);
}

function logtrace($level,$msg) {
   global $Verbose, $cmd_list, $no_args, $LogBatch;

   $DateTime=@date('Y-m-d H:i:s', time());

   if ( $level <= $Verbose ) {
      $mylvl=NULL;
      switch($level) {
         case 0:
            $mylvl ="error";
            break;
         case 1:
            $mylvl ="core ";
            break;
         case 2:
            $mylvl ="info ";
            break;
         case 3:
            $mylvl ="notic";
            break;
         case 4:
            $mylvl ="verbs";
            break;
         case 5:
            $mylvl ="dtail";
            break;
         default :
            $mylvl ="exec ";
            break;
      }
      // 2008-12-08 15:13:06 [31796] - [1] core    - Changing ID
      //"posix_getpid()=" . posix_getpid() . ", posix_getppid()=" . posix_getppid();
      $content = $DateTime. " [" .  posix_getpid() ."]:[" . $level . "]" . $mylvl . " - " . $msg . "\n";

      echo $content;
      /* called with -d to skip deamonizing , don't write to log cos process ID's are the same*/
      $ok=0;
   }
}


function arguments($argv) {
   $ARG = array();
   foreach ($argv as $arg) {
      if (strpos($arg, '--') === 0) {
         $compspec = explode('=', $arg);
         $key = str_replace('--', '', array_shift($compspec));
         $value = join('=', $compspec);
         $ARG[$key] = $value;
      } elseif (strpos($arg, '-') === 0) {
         $key = str_replace('-', '', $arg);
         if (!isset($ARG[$key])) $ARG[$key] = true;
      }
   }
   return $ARG;
}

function bfglob($path, $pattern = '*.json', $flags = 0, $depth = 1) {

   // print_r( func_get_args());
   $matches = array();
   $folders = array(rtrim($path, DIRECTORY_SEPARATOR));

   while($folder = array_shift($folders)) {
      // echo $folder . PHP_EOL;
      $matches = array_merge($matches, glob($folder.DIRECTORY_SEPARATOR.$pattern, $flags));
      if($depth != 0) {
         $moreFolders = glob($folder.DIRECTORY_SEPARATOR.'*', GLOB_ONLYDIR);
         $depth   = ($depth < -1) ? -1: $depth + count($moreFolders) - 2;
         $folders = array_merge($folders, $moreFolders);
      }
   }
   // print_r());
   return $matches;
}

function getMaps($conn,$postcode = null) {
    global $select_filemap, $select_allfilemaps;

    $results=null;

    // print_r( func_get_args());

    // SELECT imei, path FROM filemap WHERE imei=%s;

    $results=array();
    if (empty($conn)) { return $results ; }

    // SELECT path FROM filemap WHERE postcode=%s;
    if (empty($postcode)) { 
        $get_maps = sprintf($select_allfilemaps,$postcode);
    } else {
        $get_maps = sprintf($select_filemap,$postcode);
    }

    logtrace(3, sprintf("[%s] - execute query '%s'",__FUNCTION__, $get_maps));
    $rs = pg_query($conn, $get_maps);
    if (!$rs) {
        logtrace(0,"Error : " . pg_result_error($conn));
        return($results);
    } 

    //$arr = pg_fetch_array($rs, NULL, PGSQL_ASSOC);
    //pg_free_result($rs);
    $results=array();
    while ($row = pg_fetch_array($rs, NULL, PGSQL_ASSOC)) {
        $results[] = $row;
    }
    return($results);
}

function getStreets($conn,$postcode = null) {
   global $select_streets, $select_all_streets;

   $results=null;

   // print_r( func_get_args());

   // SELECT imei, path FROM filemap WHERE imei=%s;

   $results=array();
   if (empty($conn)) { return $results ; }

   if (empty($postcode)) { 
       $get_maps = sprintf($select_all_streets);
   } else {
       $get_maps = sprintf($select_streets,$postcode);
   }
   logtrace(3, sprintf("[%s] - execute query '%s'",__FUNCTION__, $get_maps));
   $rs = pg_query($conn, $get_maps);
   if (!$rs) {
       logtrace(0,"Error : " . pg_result_error($conn));
       return($results);
   } 

   //$arr = pg_fetch_array($rs, NULL, PGSQL_ASSOC);
   //pg_free_result($rs);
   $results=array();
   while ($row = pg_fetch_array($rs, NULL, PGSQL_ASSOC)) {
       $results[] = $row;
   }

   return($results);
}


function array_value_recursive($key, array $arr){
    $val = array();
    array_walk_recursive($arr, function($v, $k) use($key, &$val){
        if($k == $key) array_push($val, $v);
    });
    return (array) count($val) > 1 ? $val : array_pop($val);
}

function resource_test($resource, $name) {
    echo 
        '[' . $name. ']',
        PHP_EOL,
        '(bool)$resource => ',
        $resource ? 'TRUE' : 'FALSE',
        PHP_EOL,
        'get_resource_type($resource) => ',
        get_resource_type($resource) ?: 'FALSE',
        PHP_EOL,
        'is_resoruce($resource) => ',
        is_resource($resource) ? 'TRUE' : 'FALSE',
        PHP_EOL,
        PHP_EOL
    ;
}

?>
