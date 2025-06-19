import Connect from "./shared/connect";

function App() {
  
  return (
    <div className='app'>
      <aside className='sidebar'>
        <button className="room">R1</button>
        <button className="room">R2</button>
        <button className="room">R3</button>
      </aside>
      <main className='main'>
        <Connect />
      </main>
    </div>
  );
}

export default App;
