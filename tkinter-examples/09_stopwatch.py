import tkinter as tk

screen=tk.Tk()
screen.title("스톱워치")
screen.geometry("550x350")

seconds=0
running=False

def start():
    global running
    running=True
    
def stop():
    global running
    running=False

def reset():
    global seconds,running
    running=False
    seconds=0
    time_label.config(text="00:00:00")

def tick():
    global seconds
    if running:
        seconds+=1
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        time_label.config(text=f"{hours:02d}:{minutes:02d}:{secs:02d}")
    screen.after(1000, tick)

label = tk.Label(screen, text="스톱워치", font=("Arial", 10))
label.pack(pady=20)

time_label = tk.Label(screen, text="00:00:00", font=("Arial", 30))
time_label.pack(pady=20)

tk.Button(screen, text="Start", command=start).pack(pady=10)
tk.Button(screen, text="Stop", command=stop).pack(pady=10)
tk.Button(screen, text="Reset", command=reset).pack(pady=10)

tick()
screen.mainloop()
