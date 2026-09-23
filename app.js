const DEMO_DATE = '2026-09-23';
const STORAGE_KEY = 'campus-space-saas';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

const sampleCsv = `room_id,date,start_time,end_time,status,course\n2904,2026-09-23,09:00,11:00,scheduled,Data Structures\n2910,2026-09-23,13:00,15:00,scheduled,Computer Networks\n2703,2026-09-24,10:00,12:00,scheduled,Project Studio`;

let rooms = [];
let state = loadState();
let pendingFile = null;

function loadState(){
  try{
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
      myEvents: [], 
      courses: {}, 
      studentInfo: null, 
      uploads: [], 
      imports: 0
    };
  }catch{
    return {
      myEvents: [], 
      courses: {}, 
      studentInfo: null, 
      uploads: [], 
      imports: 0
    };
  }
}

function saveState(){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  syncRoomsFromState();
  renderDeviceProfile();
  updateStats();
}

function renderDeviceProfile() {
  const nameEl = $('#profileDisplayName');
  const regEl = $('#profileDisplayReg');
  if (!nameEl || !regEl) return;

  if (state.studentInfo && state.studentInfo.name) {
    nameEl.textContent = state.studentInfo.name;
    regEl.textContent = `Reg: ${state.studentInfo.regNo || 'Verified'}`;
  } else {
    nameEl.textContent = 'Device Session';
    regEl.textContent = 'Not verified yet';
  }
}

function syncRoomsFromState() {
  const allEvents = [
    ...(state.myEvents || []), 
    ...state.uploads.flatMap(u => u.events || [])
  ];
  
  const roomMap = new Map();
  
  for (const e of allEvents) {
    if (!e.room_id) continue;
    const cleanId = String(e.room_id).trim();
    const cleanBlock = String(e.block || cleanId.split('-')[0] || '33').trim();
    if (!roomMap.has(cleanId)) {
      const floor = parseInt(cleanId.split('-')[1]?.[0] || '1', 10);
      roomMap.set(cleanId, {
        id: cleanId,
        block: cleanBlock,
        floor: isNaN(floor) ? 1 : floor,
        capacity: 8,
        projector: true,
        whiteboard: true,
        quiet: true,
        type: 'Classroom',
        distance: '5 min',
        label: 'Student Classroom'
      });
    }
  }
  
  rooms = Array.from(roomMap.values());
  updateBlockDropdown();
}

function updateBlockDropdown() {
  const select = $('#blockFilter');
  if (!select) return;
  const currentVal = select.value;
  const blocks = [...new Set(rooms.map(r => r.block))].sort((a,b) => Number(a) - Number(b));
  
  select.innerHTML = '<option value="all">All blocks</option>' + 
    blocks.map(b => `<option value="${b}">Block ${b}</option>`).join('');
    
  if (blocks.includes(currentVal)) {
    select.value = currentVal;
  }
}

function registerRoom(roomId, blockNum) {
  const cleanId = String(roomId).trim();
  const cleanBlock = String(blockNum || cleanId.split('-')[0] || '33').trim();
  
  if (!rooms.some(r => r.id === cleanId)) {
    const floor = parseInt(cleanId.split('-')[1]?.[0] || '1', 10);
    rooms.push({
      id: cleanId,
      block: cleanBlock,
      floor: isNaN(floor) ? 1 : floor,
      capacity: 8,
      projector: true,
      whiteboard: true,
      quiet: true,
      type: 'Classroom',
      distance: '5 min',
      label: 'Student Classroom'
    });
    updateBlockDropdown();
  }
}

function timeToMinutes(t){
  if(!t) return 0;
  const [h,m] = String(t).split(':').map(Number);
  return (h||0)*60 + (m||0);
}

function overlaps(aStart,aEnd,bStart,bEnd){
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(aEnd) > timeToMinutes(bStart);
}

function getDayName(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('en-US', { weekday: 'long' });
}

function getAvailability(room,date,start,end){
  const targetDay = getDayName(date);
  
  // Real student timetable events strictly drive room availability
  const userEvents = (state.myEvents || []).filter(e => {
    const matchRoom = String(e.room_id) === String(room.id);
    const matchTime = overlaps(e.start_time, e.end_time, start, end);
    const matchDate = e.date ? e.date === date : (e.day && e.day.toLowerCase() === targetDay.toLowerCase());
    return matchRoom && matchTime && matchDate;
  });
  
  if (userEvents.length) {
    const ev = userEvents[0];
    const courseTitle = ev.course_title ? `${ev.course_code || ''}: ${ev.course_title}` : (ev.course || ev.course_code || 'Class Session');
    return { status: 'occupied', reason: `${ev.session_type || 'Class'} (${courseTitle})` };
  }
  
  return { status: 'available' };
}

function scoreRoom(room,filters,availability){
  let score=0;
  score+=availability.status==='available'?40:0;
  score+=room.capacity>=filters.capacity?20-Math.min(15,room.capacity-filters.capacity):0;
  score+=room.projector===filters.projector?10:filters.projector?-30:0;
  score+=room.whiteboard===filters.whiteboard?10:filters.whiteboard?-30:0;
  score+=room.quiet===filters.quiet?5:filters.quiet?-7:0;
  score+=(40-Number(room.block || 25))*0.05;
  score+=Math.max(0,10-(room.capacity-filters.capacity));
  return Math.round(score);
}

function searchRooms(){
  const date=$('#searchDate').value||DEMO_DATE,
        start=$('#startTime').value||'11:00',
        end=$('#endTime').value||'12:00',
        block=$('#blockFilter').value,
        capacity=Number($('#capacityFilter').value)||1,
        projector=$('#projectorFilter').checked,
        whiteboard=$('#whiteboardFilter').checked,
        quiet=$('#quietFilter').checked;

  if(timeToMinutes(end)<=timeToMinutes(start)){
    showToast('End time must be after start time');
    return;
  }
  
  const filters={date,start,end,block,capacity,projector,whiteboard,quiet};
  let matches = rooms.filter(r => 
    (block==='all'||r.block===block) &&
    r.capacity>=capacity &&
    (projector?r.projector:true) &&
    (whiteboard?r.whiteboard:true) &&
    (quiet?r.quiet:true)
  ).map(room => {
    const availability = getAvailability(room,date,start,end);
    return {...room, availability, score: scoreRoom(room,filters,availability)};
  });

  const sort=$('#sortSelect').value;
  if(sort==='capacity') matches.sort((a,b)=>a.capacity-b.capacity);
  else if(sort==='block') matches.sort((a,b)=>Number(a.block)-Number(b.block));
  else matches.sort((a,b)=>b.score-a.score||a.capacity-b.capacity);

  renderResults(matches,date,start,end);
  updateAdminStats();
}

function renderResults(matches,date,start,end){
  const grid=$('#resultsGrid');
  
  if (!state.myEvents || !state.myEvents.length) {
    $('#resultCount').textContent = '0';
    $('#resultMeta').textContent = `Upload a student timetable to calculate room availability`;
    grid.innerHTML = `<div class="empty-results">
      <div style="font-size:36px;margin-bottom:12px">📅</div>
      <b>Upload your timetable to discover available campus rooms</b>
      <p style="margin:6px 0 16px; color:var(--text-secondary); max-width:440px;">
        Upload your official <b>.docx</b> timetable export to automatically register your schedule and find free rooms during your break gaps.
      </p>
      <div style="display:flex; flex-direction:column; gap:10px; align-items:center;">
        <button class="primary-btn" onclick="showView('upload')">Upload Timetable (.docx / .csv) <span>→</span></button>
        <button class="outline-btn" onclick="promptSampleDocx()">⚡ Or load sample LPU timetable (.docx)</button>
      </div>
    </div>`;
    return;
  }

  $('#resultCount').textContent = matches.filter(r=>r.availability.status==='available').length;
  $('#resultMeta').textContent = `Scheduled availability · ${getDayName(date)} ${date} (${start}–${end})`;
  
  if(!matches.length){
    grid.innerHTML='<div class="empty-results"><div style="font-size:28px;margin-bottom:9px">⌂</div><b>No rooms match those filters in your timetable</b><span>Try widening the block, capacity, or facilities.</span></div>';
    return;
  }
  
  grid.innerHTML=matches.map(room=>roomCard(room,date,start,end)).join('');
  $$('[data-room-id]',grid).forEach(btn=>btn.addEventListener('click',()=>openRoomModal(matches.find(r=>r.id===btn.dataset.roomId),date,start,end)));
}

function roomCard(room,date,start,end){
  const occupied=room.availability.status==='occupied';
  return `<article class="room-card">
    <div class="room-top">
      <div>
        <div class="room-block">BLOCK ${room.block} · FLOOR ${room.floor}</div>
        <h3 class="room-name">Room ${room.id}</h3>
      </div>
      <span class="status-badge ${occupied?'occupied':''}">${occupied?'Occupied':'Scheduled available'}</span>
    </div>
    <div class="room-time">${start}–${end} · ${occupied?`Occupied: ${room.availability.reason}`:'No scheduled class'}</div>
    <div class="room-specs">
      <span><b>${room.capacity}</b> seats</span>
      <span><b>${room.distance}</b> away</span>
    </div>
    <div class="facility-row">
      <span class="facility ${room.projector?'match':''}">${room.projector?'✓':'—'} Projector</span>
      <span class="facility ${room.whiteboard?'match':''}">${room.whiteboard?'✓':'—'} Whiteboard</span>
      ${room.quiet?'<span class="facility match">✓ Quiet</span>':''}
    </div>
    <div class="card-actions">
      <button class="outline-btn" data-room-id="${room.id}">View details <span>→</span></button>
      <button class="directions-link" data-room-id="${room.id}">Directions</button>
    </div>
  </article>`;
}

function openRoomModal(room,date,start,end){
  const occupied=room.availability.status==='occupied';
  $('#roomModalBody').innerHTML=`
    <div class="room-modal-head">
      <div>
        <div class="room-block">BLOCK ${room.block} · FLOOR ${room.floor}</div>
        <h2>Room ${room.id}</h2>
        <div class="room-time">${room.type} · ${date} (${getDayName(date)}) · ${start}–${end}</div>
      </div>
      <span class="room-detail-status" style="${occupied?'background:#fde8e2;color:#a0473d':''}">${occupied?'Occupied':'Scheduled available'}</span>
    </div>
    <div class="detail-grid">
      <div class="detail-box"><span>Capacity</span><b>${room.capacity} people</b></div>
      <div class="detail-box"><span>Floor</span><b>Level ${room.floor}</b></div>
      <div class="detail-box"><span>Walk time</span><b>${room.distance}</b></div>
    </div>
    <div class="facility-row">
      <span class="facility ${room.projector?'match':''}">${room.projector?'✓':'—'} Projector</span>
      <span class="facility ${room.whiteboard?'match':''}">${room.whiteboard?'✓':'—'} Whiteboard</span>
      <span class="facility ${room.quiet?'match':''}">${room.quiet?'✓':'—'} Quiet area</span>
    </div>
    <div class="detail-note">✦ Availability status is derived exclusively from student-uploaded timetables for your campus.</div>
    <div style="display:flex;gap:9px;margin-top:18px">
      <button class="primary-btn" style="flex:1" onclick="showToast('Directions opened for Block ${room.block}')">Directions <span>→</span></button>
      <button class="outline-btn" onclick="showToast('Thanks — report queued for review')">Report issue</button>
    </div>`;
  openModal('roomModal');
}

function openModal(id){
  const el=$(`#${id}`);
  el.classList.add('open');
  el.setAttribute('aria-hidden','false');
}

function closeModals(){
  $$('.modal-backdrop').forEach(m=>{
    m.classList.remove('open');
    m.setAttribute('aria-hidden','true');
  });
}

function showView(view){
  $$('.view').forEach(v=>v.classList.remove('active-view'));
  $(`#${view}View`).classList.add('active-view');
  $$('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view));
  
  const labels = {
    dashboard:'Find a space',
    upload:'Upload timetable',
    timetable:'My timetable',
    admin:'Admin audit console'
  };
  $('#breadcrumbLabel').textContent = labels[view] || 'Find a space';
  
  if(window.innerWidth<821)$('#sidebar').classList.remove('open');
  if(view==='timetable')renderTimetable();
  if(view==='admin')renderAdminUploads();
}

function convert12To24Slot(slotStr) {
  const m = slotStr.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*(AM|PM)/i);
  if (!m) return ['09:00', '10:00'];
  
  let [_, startStr, endStr, ampm] = m;
  let [sh, sm] = startStr.split(':').map(Number);
  let [eh, em] = endStr.split(':').map(Number);
  const isPM = ampm.toUpperCase() === 'PM';

  if (isPM) {
    if (sh < 12) sh += 12;
    if (eh < 12 && eh < sh) eh += 12;
    else if (eh < 12 && sh >= 12) eh += 12;
  }
  
  const pad = n => String(n).padStart(2, '0');
  return [`${pad(sh)}:${pad(sm)}`, `${pad(eh)}:${pad(em)}`];
}

function extractDocxTables(xmlStr) {
  const tables = [];
  const tblMatches = xmlStr.match(/<w:tbl\b[\s\S]*?<\/w:tbl>/g) || [];
  for (const tblXml of tblMatches) {
    const rows = [];
    const trMatches = tblXml.match(/<w:tr\b[\s\S]*?<\/w:tr>/g) || [];
    for (const trXml of trMatches) {
      const cells = [];
      const tcMatches = trXml.match(/<w:tc\b[\s\S]*?<\/w:tc>/g) || [];
      for (const tcXml of tcMatches) {
        const tMatches = [...tcXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)];
        const cellText = tMatches.map(m => m[1]).join(' ').replace(/\s+/g, ' ').trim();
        cells.push(cellText);
      }
      if (cells.length) rows.push(cells);
    }
    if (rows.length) tables.push(rows);
  }
  return tables;
}

async function parseDocxArrayBuffer(arrayBuffer) {
  if (!window.JSZip) {
    throw new Error('JSZip library not loaded');
  }
  
  const zip = await JSZip.loadAsync(arrayBuffer);
  const xmlText = await zip.file("word/document.xml").async("text");
  const tables = extractDocxTables(xmlText);
  
  const gridTable = tables.find(t => t.some(r => r.some(c => c.includes('Timing'))));
  const courseTable = tables.find(t => t.some(r => r.some(c => c.includes('Course Code'))));

  const courses = {};
  if (courseTable) {
    for (let r of courseTable) {
      if (r.length >= 8 && !r[0].includes('Course Code')) {
        const [code, ctype, title, lec, tut, prac, cred, faculty] = r;
        courses[code] = { code, ctype, title, faculty };
      }
    }
  }

  const events = [];
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  if (gridTable) {
    for (let r of gridTable) {
      if (!r.length || r[0].includes('Timing')) continue;
      
      const timeSlot = r[0];
      const [startTime, endTime] = convert12To24Slot(timeSlot);
      
      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const cellText = r[dayIdx + 1];
        if (!cellText || cellText.includes("Project Work") || cellText.includes("Check Schedule Below")) continue;
        
        const m = cellText.match(/^(.*?)\s*\/\s*G:(.*?)\s+C:(.*?)\s+\/\s+R:\s*(.*?)\s+\/\s+S:(.*)/i);
        if (m) {
          const sessionType = m[1].trim();
          const group = m[2].trim();
          const courseCode = m[3].trim();
          const rawRoom = m[4].trim();
          
          const cleanRoom = rawRoom.split('(')[0].trim();
          const block = cleanRoom.split('-')[0] || '33';
          
          registerRoom(cleanRoom, block);

          const courseMeta = courses[courseCode] || {};
          
          events.push({
            day: days[dayIdx],
            start_time: startTime,
            end_time: endTime,
            room_id: cleanRoom,
            block: block,
            course_code: courseCode,
            course_title: courseMeta.title || courseCode,
            faculty: courseMeta.faculty || '',
            session_type: sessionType,
            group: group,
            status: 'scheduled'
          });
        }
      }
    }
  }

  state.courses = courses;
  return events;
}

function parseCsv(text){
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean);
  if(lines.length<2)return[];
  const headers=lines[0].split(',').map(x=>x.trim().toLowerCase());
  return lines.slice(1).map(line=>{
    const values=line.split(',').map(x=>x.trim().replace(/^"|"$/g,''));
    const row = Object.fromEntries(headers.map((h,i)=>[h,values[i]||'']));
    if (row.room_id) {
      registerRoom(row.room_id, row.room_id.split('-')[0]);
    }
    return row;
  }).filter(row=>row.room_id&&row.start_time&&row.end_time);
}

// Verification Modal & Upload Pipeline
function handleFileSelect(file){
  if(!file) return;
  pendingFile = {
    type: file.name.toLowerCase().endsWith('.docx') ? 'docx' : 'csv',
    fileName: file.name,
    file: file
  };
  triggerVerificationOrProcess();
}

async function promptSampleDocx() {
  try {
    showToast('Fetching sample timetable...');
    const res = await fetch('rptTimeTableStudent.docx');
    if(!res.ok) throw new Error('File fetch failed');
    const buffer = await res.arrayBuffer();
    pendingFile = {
      type: 'docx_buffer',
      fileName: 'rptTimeTableStudent.docx',
      buffer: buffer
    };
    triggerVerificationOrProcess();
  } catch(err) {
    showToast('Error loading sample: ' + err.message);
  }
}

function triggerVerificationOrProcess() {
  // PERSISTENCE RULE: If this device already has verified Student Name and Reg No saved in localStorage,
  // reuse it directly without prompting again!
  if (state.studentInfo && state.studentInfo.name && state.studentInfo.regNo) {
    executeUploadIngestion(state.studentInfo.name, state.studentInfo.regNo);
  } else {
    openVerificationModal();
  }
}

function openVerificationModal() {
  if (state.studentInfo) {
    $('#studentNameInput').value = state.studentInfo.name || '';
    $('#studentRegNoInput').value = state.studentInfo.regNo || '';
  }
  openModal('verificationModal');
}

async function processVerificationSubmit(e) {
  e.preventDefault();
  const name = $('#studentNameInput').value.trim();
  const regNo = $('#studentRegNoInput').value.trim();

  if (!name || !regNo) {
    showToast('Please enter both Student Name and Registration Number');
    return;
  }

  state.studentInfo = { name, regNo };
  closeModals();
  renderDeviceProfile();

  if (pendingFile) {
    await executeUploadIngestion(name, regNo);
  } else {
    saveState();
    showToast(`Device session updated for ${name} (${regNo})`);
  }
}

async function executeUploadIngestion(name, regNo) {
  if (!pendingFile) return;

  try {
    showToast(`Ingesting timetable for ${name}...`);
    let events = [];

    if (pendingFile.type === 'docx') {
      const buffer = await pendingFile.file.arrayBuffer();
      events = await parseDocxArrayBuffer(buffer);
    } else if (pendingFile.type === 'docx_buffer') {
      events = await parseDocxArrayBuffer(pendingFile.buffer);
    } else if (pendingFile.type === 'csv') {
      const text = await pendingFile.file.text();
      events = parseCsv(text);
    }

    if (!events.length) {
      showToast('No valid timetable slots found');
      return;
    }

    state.myEvents = events;
    state.imports = (state.imports || 0) + 1;

    const extractedRooms = [...new Set(events.map(e => e.room_id))];

    // Log upload in state.uploads for Hidden Admin Portal
    state.uploads.unshift({
      id: 'up_' + Date.now(),
      studentName: name,
      regNo: regNo,
      fileName: pendingFile.fileName,
      uploadedAt: new Date().toISOString(),
      sessionCount: events.length,
      rooms: extractedRooms,
      events: events
    });

    saveState();
    renderTimetable();
    searchRooms();
    showView('timetable');
    showToast(`Verified & loaded ${events.length} sessions for ${name}!`);
    pendingFile = null;

  } catch (err) {
    console.error(err);
    showToast('Error processing file: ' + err.message);
  }
}

function renderTimetable(){
  const events = state.myEvents || [];
  $('#myClassCount').textContent = events.length;
  
  const days = [...new Set(events.map(e=>e.day || formatDate(e.date)))];
  $('#myGapCount').textContent = days.length;
  $('#loadedTitle').textContent = events.length ? `${events.length} sessions · ${days.length} days active` : 'No timetable loaded yet';
  
  const wrap = $('#timetableTableWrap');
  if(!events.length){
    wrap.className='empty-state';
    wrap.innerHTML='<div class="empty-icon">▦</div><b>No student timetable loaded</b><span>Go to Upload Timetable to verify and add your schedule.</span>';
    return;
  }
  
  wrap.className='table-scroll';
  wrap.innerHTML=`<table class="data-table">
    <thead>
      <tr>
        <th>Day / Date</th>
        <th>Time</th>
        <th>Room</th>
        <th>Course & Session</th>
        <th>Faculty Details</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${events.map(e => `<tr>
        <td><b>${e.day || formatDate(e.date)}</b></td>
        <td>${e.start_time}–${e.end_time}</td>
        <td><b>Room ${e.room_id}</b> (Block ${e.block || e.room_id.split('-')[0]})</td>
        <td>
          <div><b>${e.course_title || e.course || 'Class'}</b></div>
          <small style="color:var(--text-secondary)">${e.course_code || ''} · ${e.session_type || 'Lecture'} (Group ${e.group || 'All'})</small>
        </td>
        <td><small>${e.faculty || 'Instructor'}</small></td>
        <td><span class="local-badge">Verified Schedule</span></td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function formatDate(date){
  if(!date) return 'Weekly';
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
}

function updateStats(){
  updateAdminStats();
}

function updateAdminStats(){
  const uploads = state.uploads || [];
  const totalRooms = [...new Set(uploads.flatMap(u => u.rooms || []))].length;
  const totalClasses = uploads.reduce((acc, u) => acc + (u.sessionCount || 0), 0);

  if ($('#adminTotalUploads')) $('#adminTotalUploads').textContent = uploads.length;
  if ($('#adminTotalRooms')) $('#adminTotalRooms').textContent = totalRooms;
  if ($('#adminTotalClasses')) $('#adminTotalClasses').textContent = totalClasses;
}

function renderAdminUploads(){
  updateAdminStats();
  const wrap = $('#adminUploadsTableWrap');
  const uploads = state.uploads || [];

  if (!uploads.length) {
    wrap.innerHTML = '<div class="empty-small" style="padding:24px; text-align:center; color:var(--text-secondary);">No student upload submissions recorded yet.</div>';
    return;
  }

  wrap.innerHTML = `<table class="data-table">
    <thead>
      <tr>
        <th>Student Name</th>
        <th>Registration No</th>
        <th>File Uploaded</th>
        <th>Upload Date & Time</th>
        <th>Classes</th>
        <th>Extracted Rooms</th>
      </tr>
    </thead>
    <tbody>
      ${uploads.map(u => `<tr>
        <td><b>${u.studentName}</b></td>
        <td><code>${u.regNo}</code></td>
        <td>${u.fileName}</td>
        <td><small>${new Date(u.uploadedAt).toLocaleString('en-IN')}</small></td>
        <td><b>${u.sessionCount} sessions</b></td>
        <td><small style="color:var(--text-secondary)">${(u.rooms || []).join(', ')}</small></td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function showToast(message){
  $('#toastText').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => $('#toast').classList.remove('show'), 2800);
}

// Event Listeners
$('#searchForm').addEventListener('submit', e => { e.preventDefault(); searchRooms(); });
$('#sortSelect').addEventListener('change', searchRooms);
$('#clearFilters').addEventListener('click', () => {
  $('#blockFilter').value = 'all';
  $('#capacityFilter').value = 1;
  $('#projectorFilter').checked = false;
  $('#whiteboardFilter').checked = false;
  $('#quietFilter').checked = false;
  searchRooms();
});

$$('.nav-item').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
$$('[data-view-target]').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.viewTarget)));
$('#mobileMenu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
$$('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModals));
$$('.modal-backdrop').forEach(m => m.addEventListener('click', e => { if(e.target===m) closeModals(); }));

$('#chooseFile').addEventListener('click', () => $('#timetableInput').click());
$('#timetableInput').addEventListener('change', e => handleFileSelect(e.target.files[0]));
$('#loadSampleDocx')?.addEventListener('click', promptSampleDocx);
$('#verificationForm').addEventListener('submit', processVerificationSubmit);
$('#editProfileBtn')?.addEventListener('click', () => openVerificationModal());

['dragenter','dragover'].forEach(evt => $('#dropzone').addEventListener(evt, e => {
  e.preventDefault();
  $('#dropzone').classList.add('dragover');
}));

['dragleave','drop'].forEach(evt => $('#dropzone').addEventListener(evt, e => {
  e.preventDefault();
  $('#dropzone').classList.remove('dragover');
}));

$('#dropzone').addEventListener('drop', e => handleFileSelect(e.dataTransfer.files[0]));

$('#downloadTemplate').addEventListener('click', () => {
  const blob = new Blob([sampleCsv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'campus-space-timetable-template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
});

// URL Hash router for Hidden Admin Audit Portal (#admin)
window.addEventListener('hashchange', () => {
  if (window.location.hash === '#admin') {
    showView('admin');
  }
});

// Initial Execution
syncRoomsFromState();
renderDeviceProfile();
updateStats();

if (window.location.hash === '#admin') {
  showView('admin');
} else {
  searchRooms();
}

if('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(()=>{});
}
