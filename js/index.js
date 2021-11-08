const baudrates = document.getElementById("baudrates");
const connectButton = document.getElementById("connectButton");
const disconnectButton = document.getElementById("disconnectButton");
const resetButton = document.getElementById("resetButton");
const consoleStartButton = document.getElementById("consoleStartButton");
const resetMessage = document.getElementById("resetMessage");
const eraseButton = document.getElementById("eraseButton");
const programButton = document.getElementById("programButton");
const filesDiv = document.getElementById("files");
const terminal = document.getElementById("terminal");
const consoleDiv = document.getElementById("console");
const lblConnTo = document.getElementById("lblConnTo");
const table = document.getElementById('fileTable');
const alertDiv = document.getElementById('alertDiv');
const settingsWarning = document.getElementById("settingsWarning");
const progressMsgQS = document.getElementById("progressMsgQS");
const progressMsgDIY = document.getElementById("progressMsgDIY");
const deviceTypeSelect = document.getElementById("device");
const frameworkSelect = document.getElementById("frameworkSel");
const chipSetsRadioGroup = document.getElementById("chipsets");
const FILE_SERVER_HOST = "local";

//import { Transport } from './cp210x-webusb.js'
import { Transport } from './webserial.js'
import { ESPLoader } from './ESPLoader.js'

let term = new Terminal({cols:100, rows:25, fontSize: 14});
term.open(terminal);

let device = null;
let transport;
let chip = "default";
let esploader;
let file1 = null;
let connected = false;
let index = 1;
let rmOptions = ["Fan", "GPIO", "Homekit Switch", "Led Light", " Multi Device", "Switch", "Temperature Sensor"];
let rmOptValues = ["fan", "gpio", "homekit_switch", "led_light", "multi_device", "switch", "temperature_sensor"];
let matterOptions = ["x"];
let matterOptValues = ["all-clusters-app_te6"];


disconnectButton.style.display = "none";
eraseButton.style.display = "none";
var config = [];
var isDefault = true;

async function checkAutoLoad() {
    const urlParams = new URLSearchParams(window.location.search);
    var tomlFileURL = urlParams.get('flashConfigURL');
    if(!tomlFileURL)
        tomlFileURL = document.location.href + "/config/default_config.toml";
    else
        isDefault = false;

    var xhr = new XMLHttpRequest();
    xhr.open('GET', tomlFileURL, true);
    xhr.send();
    xhr.onload = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            config = toml.parse(xhr.responseText);
            /*
            $('#preview_esp_frm').html(config.esp_framework);
            $('#preview_esp_chip').html(config.esp_chipset_type);
            $('#preview_esp_device').html(config.esp_device_type);
            $('#preview_example_name').html(config.example_name);
            $('#preview_firmware_image').html(config.firmware_image_url);
            $('#previewModal').click();
            */
            if(!isDefault) {
                $("#qtLabel").html("Choose the firmware images listed below. <Br> You have chosen to try the firmware images from an <b><u>external source</u> - "
                                            + tomlFileURL + "</b>");
            }

            const frameworks = config["esp_frameworks"];
            if (frameworks) {
                frameworkSelect.innerHTML = "";
                frameworks.forEach(framework => {
                    var frameworkOption = framework.split(':');
                    var option = document.createElement("option");
                    option.value = frameworkOption[0];
                    option.text = frameworkOption[1];
                    frameworkSelect.appendChild(option);
                });
            }
            if(frameworkSelect)
            {
                populateDeviceTypes(config[frameworkSelect.value]);
                populateSupportedChipsets(config[frameworkSelect.value]);
            }

            return config;
        }
    }
}

config = await checkAutoLoad();

function populateDeviceTypes(imageConfig) {
    deviceTypeSelect.innerHTML = "";
    const availableImages = imageConfig["images"];
    availableImages.forEach(image => {
        var imageOption = image.split(':');
        var option = document.createElement("option");
        option.value = imageOption[0];
        option.text = imageOption[1];
        deviceTypeSelect.appendChild(option);
    });
    /*
    if (product === "rainmaker"){
        for (let i = 0; i < rmOptions.length; i++)
        {
            var option = document.createElement("option");
            option.value = rmOptValues[i];
            option.text = rmOptions[i];
            deviceTypeSelect.appendChild(option);
        }
    }
    else if (product == "matter"){
        for (let i = 0; i < matterOptions.length; i++)
        {
            var option = document.createElement("option");
            option.value = matterOptValues[i];
            option.text = matterOptions[i];
            deviceTypeSelect.appendChild(option);
        }
    }
    */
}

function populateSupportedChipsets(chipsetConfig) {
    chipSetsRadioGroup.innerHTML = "";
    const supportedChipSets = chipsetConfig["supported_chipsets"];
    let i = 1;
    supportedChipSets.forEach(chipset => {
        var chipKV = chipset.split(":");
        var div = document.createElement("div");
        div.setAttribute("class", "form-check-inline");

        var lblElement = document.createElement("label");
        lblElement.setAttribute("class", "form-check-label");
        lblElement.setAttribute("for", "radio" + i);
        lblElement.innerHTML = chipKV[1] + "&nbsp;";

        var inputElement = document.createElement("input");
        inputElement.setAttribute("type", "radio");
        inputElement.setAttribute("class", "form-check-input");
        inputElement.name = "chipType";
        inputElement.id = "radio" + i;
        inputElement.value = chipKV[0]
        if (i==1)
            inputElement.checked = true;

        lblElement.appendChild(inputElement);

        div.appendChild (lblElement);

        chipSetsRadioGroup.appendChild(div);

        i++;
    });
}

$('#frameworkSel').on('change', function() {
    populateDeviceTypes(config[frameworkSelect.value]);
    populateSupportedChipsets(config[frameworkSelect.value]);
});

$(function () {
    $('[data-toggle="tooltip"]').tooltip()
})

function convertUint8ArrayToBinaryString(u8Array) {
	var i, len = u8Array.length, b_str = "";
	for (i=0; i<len; i++) {
		b_str += String.fromCharCode(u8Array[i]);
	}
	return b_str;
}

function convertBinaryStringToUint8Array(bStr) {
	var i, len = bStr.length, u8_array = new Uint8Array(len);
	for (var i = 0; i < len; i++) {
		u8_array[i] = bStr.charCodeAt(i);
	}
	return u8_array;
}

function handleFileSelect(evt) {
    var file = evt.target.files[0];
    var reader = new FileReader();

    reader.onload = (function(theFile) {
        return function(e) {
            file1 = e.target.result;
            evt.target.data = file1;
        };
    })(file);

    reader.readAsBinaryString(file);
}


document.getElementById('selectFile1').addEventListener('change', handleFileSelect, false);

function _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


async function connectToDevice() {
    if (device === null) {
        device = await navigator.serial.requestPort({
            filters: [{ usbVendorId: 0x10c4 }]
        });
        transport = new Transport(device);
    }

    try {
        esploader = new ESPLoader(transport, baudrates.value, term);
        connected = true;

        chip = await esploader.main_fn();

        await esploader.flash_id();
    } catch(e) {
    }

}

function postConnectControls() {
    lblConnTo.innerHTML = "<b><span style='color:#17a2b8'>Connected to device: </span>" + chip + "</b>";
    lblConnTo.style.display = "block";
    $("#baudrates").prop("disabled", true);
    $("#flashButton").prop("disabled", false);
    $("#programButton").prop("disabled", false);
    $("#consoleStartButton").prop("disabled", false);
    settingsWarning.style.display = "initial";
    connectButton.style.display = "none";
    disconnectButton.style.display = "initial";
    eraseButton.style.display = "initial";
    filesDiv.style.display = "initial";
}

connectButton.onclick = async () => {
    if(!connected)
        await connectToDevice();

    console.log("Settings done for :" + chip);
    postConnectControls();

}

resetButton.onclick = async () => {
    resetMessage.style.display = "none";
    await transport.setDTR(false);
    await new Promise(resolve => setTimeout(resolve, 100));
    await transport.setDTR(true);
    consoleStartButton.style.display = "block";
}

eraseButton.onclick = async () => {
    eraseButton.disabled = true;
    $('#v-pills-console-tab').click();
    await esploader.erase_flash();
    eraseButton.disabled = false;
}

addFile.onclick = async () => {
    var rowCount = table.rows.length;
    var row = table.insertRow(rowCount);
    
    //Column 1 - Offset
    var cell1 = row.insertCell(0);
    var element1 = document.createElement("input");
    element1.type = "text";
    element1.id = "offset" + rowCount;
    element1.setAttribute('value', '0x8000');
    cell1.appendChild(element1);
    
    // Column 2 - File selector
    var cell2 = row.insertCell(1);
    var element2 = document.createElement("input");
    element2.type = "file";
    element2.id = "selectFile" + rowCount;
    element2.name = "selected_File" + rowCount;
    element2.addEventListener('change', handleFileSelect, false);
    cell2.appendChild(element2);
    
    // Column 3  - Remove File
    var cell3 = row.insertCell(2);
    var element3 = document.createElement("input");
    element3.type = "button";
    var btnName = "button" + rowCount;
    element3.name = btnName;
    element3.setAttribute('class', "btn");
    element3.setAttribute('value', 'Remove'); // or element1.value = "button";
    element3.onclick = function() {
            removeRow(btnName);
    }
    cell3.appendChild(element3);
}

function removeRow(btnName) {
    var rowCount = table.rows.length;
    for (var i = 0; i < rowCount; i++) {
        var row = table.rows[i];
        var rowObj = row.cells[2].childNodes[0];
        if (rowObj.name == btnName) {
            table.deleteRow(i);
            rowCount--;
        }
    }
}

disconnectButton.onclick = async () => {
    await transport.disconnect();
    term.clear();
    connected = false;
    $("#baudrates").prop("disabled", false);
    $("#flashButton").prop("disabled", true);
    $("#programButton").prop("disabled", true);
    $("#consoleStartButton").prop("disabled", true);
    settingsWarning.style.display = "none";
    connectButton.style.display = "initial";
    disconnectButton.style.display = "none";
    eraseButton.style.display = "none";
    lblConnTo.style.display = "none";
    alertDiv.style.display = "none";
};

consoleStartButton.onclick = async () => {
    if (device === null) {
        device = await navigator.serial.requestPort({
            filters: [{ usbVendorId: 0x10c4 }]
        });
        transport = new Transport(device);
    }
    resetMessage.style.display = "block";
    consoleStartButton.style.display = "none";

    await transport.disconnect();
    await transport.connect();

    while (true) {
        let val = await transport.rawRead();
        if (typeof val !== 'undefined') {
            term.write(val);
        } else {
            break;
        }
    }
    console.log("quitting console");
}


function validate_program_inputs() {
    let offsetArr = []
    var rowCount = table.rows.length;
    var row;
    let offset = 0;
    let fileData = null;
 
    // check for mandatory fields
    for (let index = 1; index < rowCount; index ++) {
        row = table.rows[index];

        //offset fields checks
        var offSetObj = row.cells[0].childNodes[0];
        offset = parseInt(offSetObj.value);

        // Non-numeric or blank offset
        if (Number.isNaN(offset))
            return "Offset field in row " + index + " is not a valid address!"
        // Repeated offset used
        else if (offsetArr.includes(offset))
            return "Offset field in row " + index + " is already in use!";
        else
            offsetArr.push(offset);

        var fileObj = row.cells[1].childNodes[0];
        fileData = fileObj.data;
        if (fileData == null)
            return "No file selected for row: " + index + "!";

    }
    return "success"
}

programButton.onclick = async () => {
    var err = validate_program_inputs();
    if (err != "success") {
        const alertMsg = document.getElementById("alertmsg");
        alertMsg.innerHTML = "<strong>" + err + "</strong>";
        alertDiv.style.display = "block";
        return;
    }
    progressMsgDIY.style.display = "inline";
    let fileArr = [];
    let offset = 0x1000;
    var rowCount = table.rows.length;
    var row;
    for (let index = 1; index < rowCount; index ++) {
        row = table.rows[index];
        var offSetObj = row.cells[0].childNodes[0];
        offset = parseInt(offSetObj.value);

        var fileObj = row.cells[1].childNodes[0];
       
        fileArr.push({data:fileObj.data, address:offset});
    }
    esploader.write_flash({fileArray: fileArr, flash_size: 'keep'});
    $('#v-pills-console-tab').click();
}

async function downloadAndFlash(fileURL) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', fileURL, true);
    xhr.responseType = "blob";
    xhr.send();
    xhr.onload = function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
            var blob = new Blob([xhr.response], {type: "application/octet-stream"});
            var reader = new FileReader();
            reader.onload = (function(theFile) {
                return function(e) {
                    $('#v-pills-console-tab').click();
                    esploader.write_flash({fileArray: [{data:e.target.result, address:0x0000}], flash_size: 'keep'});
                };
            })(blob);
            reader.readAsBinaryString(blob);
        }
    }
}

flashButton.onclick = async () => {
    let chipType = $("input[type='radio'][name='chipType']:checked").val();
    let framework = frameworkSelect.value;
    let deviceType = deviceTypeSelect.value;
    let flashFile = chipType + "_" + framework + "_" + deviceType + "_merged.bin";
    var file_server_url = config.firmare_images_url;

    progressMsgQS.style.display = "inline";

    downloadAndFlash(file_server_url + flashFile);

    $("#progressMsgQS").html("You can download your phone app from respective app stores. <br> <a href='" + config[frameworkSelect.value].android_app_url + 
    "' target='_blank'><img src='../assets/gplay_download.png' height='60' width='150'></a>" +
    "<a href='" + config[frameworkSelect.value].ios_app_url + "' target='_blank'><img src='../assets/appstore_download.png' height='60' width='150'></a>");
    while (esploader.status === "started") {
        await _sleep(5000);
        console.log("waiting for flash write to complete ...");
    }
    $("#statusModal").click();
}

connectPreview.onclick = async () => {
    await connectToDevice();
    if (connected) {
        $('#connectPreview').prop("disabled", true)
        $('#flashCustom').prop("value", "Flash Device: " + chip);
        $('#flashCustom').prop("disabled", false);
    }
}

flashCustom.onclick = async () => {
    if(connected) {
        if (chip != 'default'){
            if (config.esp_chipset_type.toLowerCase() === chip.split('-')[0].toLowerCase()) {
                await downloadAndFlash(config.firmware_image_url)
            }
            else
                alert('Incompatible chipset for the firmare!');
        }
        else
            alert('Chipset type not recognizable!');
    }
    postConnectControls();
}
