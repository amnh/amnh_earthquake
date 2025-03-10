var viewer, scene, handler, points;

var today = Date.now()
var thisday = today - (1000*60*60*24)               // TIMES ARE CURRENTLY SCALED FOR TESTING ONE MONTH OF DATA
var thisweek = today - (1000*60*60*24*7)            // USE OTHER SET OF VARIABLES BELOW FOR ONE YEAR OF DATA
var thismonth = today - (1000*60*60*24*14)       
var thisyear = today - (1000*60*60*24*21)
var historical = today - (1000*60*60*24*30)

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ SETUP CESIUM

var currPickedObject, pickedObject, prevPickedObject = undefined;
var dblclicked = undefined;

var setupGlobe = function(){
    // console.log("setting up globe")
    //new Cesium object, displays planet, generic zoom/display level
    viewer = new Cesium.Viewer('cesiumContainer', {
        imageryProvider: new Cesium.ArcGisMapServerImageryProvider({
            url: 'https://services.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer'
        }),
        baseLayerPicker: false,
        animation: false,
        timeline: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        fullscreenButton: false,
        selectionIndicator : false,
        navigationHelpButton: false
    });

    scene = viewer.scene;

    scene.screenSpaceCameraController.minimumZoomDistance=3000000;
    scene.screenSpaceCameraController.maximumZoomDistance=100000000;

    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ overwriting default mouse actions

    // DOUBLE CLICK ACTION
    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);       

    var dblclick_handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    dblclick_handler.setInputAction(function(dblclick){
        dblclicked = scene.pick(dblclick.position);             // get the entity and center the view on it
        if (dblclicked != undefined){
            // console.log(dblclicked)
            if (dblclicked['id']['_name']=="questionSpot"){
                var whichQuestion = dblclicked['id']['_id']
                // console.log(whichQuestion)
                $('#'+ whichQuestion).click()
            } else {
                var loc = dblclicked["primitive"]["_position"]
                centerClicked(loc);
            }
        }
    }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)

    // CLICK ACTION
    var click_handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    click_handler.setInputAction(function(click){
        var clicked = scene.pick(click.position);
        if (clicked != undefined){
            // console.log(clicked["id"]["_description"]["_value"])
            if (clicked['id']['_name']=="questionSpot"){            // if it's a question - open the question up
                var whichQuestion = clicked['id']['_id']
                // console.log(whichQuestion)
                if ($('#'+ whichQuestion).children("i").hasClass("up")) {
                    $('.q-entry').each(function(){
                        $(this).children("i").removeClass("down").addClass("up").siblings('p').slideUp();
                    })
                    $('#'+ whichQuestion).children("i").removeClass("up").addClass("down").siblings('p').slideDown();
                    var loc = clicked["primitive"]["_position"]
                    centerClicked(loc);
                } else {                                            // if it's open already, center the view on it
                    var loc = clicked["primitive"]["_position"]
                    centerClicked(loc);
                }
            } else if (clicked['id']['_name'] == "earthquake"){
                var desc = clicked["id"]["_label"]["_text"]["_value"]
                showEQDesc(desc);
            } else if (clicked['id']['_name'] == "retm") {
                var id = clicked["id"]["_id"]
                var eqid = clicked["id"]["_description"]["_value"]
                showRETMView(id, eqid);
            }
        }

        if (isRetmOpen) {
            $('#retm-view').slideUp();
            isRetmOpen = false;
        }

    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    // HOVER ACTION
    var move_handler = new Cesium.ScreenSpaceEventHandler(scene.canvas);
    move_handler.setInputAction(function(movement) {
        currPickedObject = scene.pick(movement.endPosition);

        if (currPickedObject !== undefined && currPickedObject["id"] !== undefined){
            if (pickedObject !== currPickedObject){
                prevPickedObject = pickedObject
                pickedObject = currPickedObject
                
                if (prevPickedObject !== pickedObject && prevPickedObject !== undefined ){      // if current thing is a thing un-highlight previous thing if it was a thing
                    if (prevPickedObject["id"]["_name"] == "questionSpot"){
                        highlightPoint("question", prevPickedObject, false)
                    } else if(prevPickedObject["id"]["_name"] == "retm"){
                        highlightPoint("retm", prevPickedObject, false)
                    } else {
                        highlightPoint("eq", prevPickedObject, false)
                    }
                }

                if (pickedObject["id"]["_name"] == "questionSpot"){                             // highlight current thing 
                    highlightPoint("question", pickedObject, true)
                } else if (pickedObject["id"]["_name"] == "retm"){
                    highlightPoint("retm", pickedObject, true)
                } else {
                    highlightPoint("eq", pickedObject, true)
                }
            }
        } else if (currPickedObject == undefined || currPickedObject["id"] !== undefined){      // if current thing isn't a thing, unhighlight the previous thing
            if (pickedObject !== undefined ){
                if (pickedObject["id"]["_name"] == "questionSpot"){                     
                    highlightPoint("question", pickedObject, false)
                } else if (pickedObject["id"]["_name"] == "retm"){
                    highlightPoint("retm", pickedObject, false)
                } else {
                    highlightPoint("eq", pickedObject, false)
                }
                pickedObject = undefined
            }
        }
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ REMAPPING VALUES

var eq_opacity = "1"

var eq_color = function(time) {  // mapping color to time of eq
    if ( time > historical ){
        var color = d3.scaleLinear()
        .domain([today,thisyear])
        .range(["#FFD13F","#A52710"])
        .clamp(true);
        return color(time)
    } else { return '#7F1200' }         // color for "history" earthquakes
}

var eq_time = function(time) {  // mapping time to filter values
    if ( time > historical ){
        var color = d3.scaleLinear()
        .domain([today,thisyear])
        .range([6,1])
        .clamp(true);
        return Math.floor(color(time))
    } else { return 0 }         // time for "history" earthquakes
}

var eq_size = function(date, mag){
    var size = d3.scalePow().exponent(3)
        .domain([1, 7])
        .range([7, 50])
        .clamp(true);

    if (date > historical){
        return size(mag);
    } else { return 3; }
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ DRAWING ALL ENTITIES ON GLOBE

var drawData = function(earthquakes){
    // console.log("drawing earthquakes")

    for (var i = 0; i < earthquakes.length; i++) {
        var lat = earthquakes[i].geometry.coordinates[0];
        var lon = earthquakes[i].geometry.coordinates[1];
        var mag = earthquakes[i].properties.mag;
        var name = earthquakes[i].properties.place;
        var date = new Date(earthquakes[i].properties.time);

        if (mag < 2){
            continue;
        }

        viewer.entities.add({                                       // add a circle at the earthquake location
            description : eq_time(date)+" "+mag,
            label : {
                        text : date+"|"+earthquakes[i].properties.title,
                        show : false,
                        scale : 0.5,
                        horizontalOrigin : Cesium.HorizontalOrigin.LEFT,
                        pixelOffset : new Cesium.Cartesian2(15, 0),
                        scaleByDistance : new Cesium.NearFarScalar(1.5e2, 2.0, 1.5e7, 0.5),
                    },
            position : Cesium.Cartesian3.fromDegrees(lat, lon, eq_time(date)*1000),
            point : {
                pixelSize : eq_size(date, mag),
                color : Cesium.Color.fromCssColorString(eq_color(date)),
                outlineWidth: eq_time(date)/4
            },
            name: "earthquake"
        });
    }
}

var addQuestions = function(data){                                  // add question icon to locations of question spots
    for (var i = 0; i < data.length; i++){
        viewer.entities.add({
            position : Cesium.Cartesian3.fromDegrees(data[i]["coordinates"][1], data[i]["coordinates"][0], 200000),
            billboard :{
                image : 'req/question.png',
                scale: 0.05,
            },
            id : data[i]["id"],
            name : "questionSpot",
            description : data[i]["name"]
        });
    }
}

var addRETMtoGlobe = function(data){                                // add big purple dots for retm
    // console.log(data)
    for (var i = 0; i < data.length; i++){
        viewer.entities.add({
            position : Cesium.Cartesian3.fromDegrees(data[i]["location"]["lng"], data[i]["location"]["lat"], 200000),
            point : {
                pixelSize : 50,
                color : Cesium.Color.fromCssColorString('#A527FF'),
                outlineWidth: 1
            },
            id : "retm" + i,
            name : "retm",
            description : data[i]["iris_dmc_event_id"]
        });
    }
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ INTERACTION

var isRetmOpen = false;
var showRETMView = function(id, eqid){

    var info = $('#'+id).attr("data-earthquake")
    $('#retm-info').text(info);
    $('#retm-waveform').attr("src", "data/" + eqid + "_waveform.png");

    if(isDescOpen){
        $('#eq-desc').slideUp()
        isDescOpen = false;
    }

    if(!isRetmOpen){
        $('#retm-view').slideDown()
        // isRetmOpen = true;
    }

    setTimeout(function(){
        isRetmOpen = true;
    }, 1000);
}

var isDescOpen = false;

var showEQDesc = function(value){
    var text = value.split("|")
    var date = text[0].split(" ")
    // console.log(text)

    $('#eq-desc').html('<p>'+date[0]+" "+date[1]+" "+date[2]+" "+date[3]+" "+date[4]+'</p><p>'+text[1]+'</p>')


    if(isRetmOpen) {
        $('#retm-view').slideUp();
        isRetmOpen = false;
    }

    if (!isDescOpen){
        $('#eq-desc').slideDown()
        isDescOpen = true;
    }
    setTimeout(function(){
      if (isDescOpen){
        $('#eq-desc').slideUp()
        isDescOpen = false;
      }
    }, 5000);
}

// ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ MOUSEOVER

var highlightPoint = function(type, object, isHighlighted){                 // how to highlight various things and their corresponding html elements
    if (type == "eq"){
        var desc = object["id"]["_description"]["_value"]                 // check if it's a historical eq
        var split = desc.split(" ")
        if (split[0] != 0){
            if (isHighlighted){
                // console.log(object['primitive'])
                // object.entity.point.color = Cesium.Color.WHITE;
                // object["primitive"]["_color"]["blue"] = 1
                // object["primitive"]["_color"]["green"] = 1
                // object["primitive"]["_color"]["red"] = 1
                // object["primitive"]["_color"]["_show"]["_value"] = true;
            } else {
                // object["id"]["_label"]["_show"]["_value"] = false;
            }
        }
    } else if (type == "question"){
        var id = object["id"]["_id"]
        if (isHighlighted){
            $('#'+id).addClass("highlighted")
            $('#'+id).children("i").css("border", "solid black").css("border-width", "0 3px 3px 0")
        } else {
            $('#'+id).removeClass("highlighted")
            $('#'+id).children("i").css("border", "solid white").css("border-width", "0 3px 3px 0")
        }
    } else {            // retm
        // var id = object["id"]["_id"]
        // var eqid = object["id"]["_description"]["_value"]

        if (isHighlighted){
            $('#'+id).addClass("highlighted")
            // var info = $('#'+id).attr("data-earthquake")
            // // console.log(info)
            // $('#retm-info').text(info);
            // $('#retm-waveform').attr("src", "data/" + eqid + "_waveform.png");
            // if(isDescOpen){
            //     $('#eq-desc').slideUp()
            //     isDescOpen = false;
            // }
            // $('#retm-view').slideDown();

        } else {
            $('#'+id).removeClass("highlighted")
            // $('#retm-view').slideUp();
        }
    }
}

var centerClicked = function(obj){          // convert x/y/z of entity location to cartesian coordinates
    var x = obj.x;
    var y = obj.y;
    var z = obj.z;

    var loc = Cesium.Cartesian3.fromArray([x,y,z])
    var carto  = Cesium.Ellipsoid.WGS84.cartesianToCartographic(loc);     
    var lon = Cesium.Math.toDegrees(carto.longitude); 
    var lat = Cesium.Math.toDegrees(carto.latitude); 

    rotateTo(lat, lon, 3)
}

var spinGlobe = function(angle) {           // rotate around during idle
    viewer.camera.rotateLeft(angle);
}

var rotateTo = function(lat, lon, focus){               // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ rotate globe to location
    var height
    if (focus == 1){                                // setting distance away depending on what's happening
        height = 15000000; 
    } else if (focus == 2) {
        height = 8000000
    } else {
        height = 4000000
    }

    viewer.camera.flyTo({
        destination : Cesium.Cartesian3.fromDegrees(lon, lat, height),
        duration: 1.5
    });
}

var filterData = function(timeval, sizeval){        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ filter with knob/slider
    // console.log(timeval, sizeval)

    for (var i = 0; i < viewer.entities.values.length; i ++){
        var val = viewer.entities.values[i].description["_value"]
        var vals = val.split(" ")       // [time, size]
        if (vals[0] == 0){
            viewer.entities.values[i].show = true;
        } else if (vals[0] < timeval || vals[1] < sizeval) {
            viewer.entities.values[i].show = false;
        } else {
            viewer.entities.values[i].show = true;
        }
    }
}

