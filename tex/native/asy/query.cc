// what keepState added changes the output from there on: the next run's output is read from a
// marker written after it
void iopipestream::keepState(const string& s)
{
  if(s.empty()) return;
  // the same font commands again with nothing written since change nothing; leaving them out
  // keeps what was written, and so the worker's answers, the same from label to label
  if(s == lastKept && transcript.size() == keptAt) return;
  transcript += s;
  transcript += "\\immediate\\write16{>galleysync<}\n";
  lastKept=s;
  keptAt=transcript.size();
  resync=true;
}

// TeX's output for what was written plus q (between markers); q is not kept, keep is
string iopipestream::query(const string& q, const string& keep)
{
  string a;
  for(size_t i=0; i < cmd.size(); ++i) {a += cmd[i]; a.push_back('\0');}
  string input=transcript+"\\immediate\\write16{>galleyq<}\n"+q+
    "\\immediate\\write16{>galleyend<}\n";
  int n=galley_pipe_js(a.data(),(int) a.size(),input.data(),(int) input.size());
  string out(n,'\0');
  if(n > 0) galley_pipe_take(&out[0]);
  keepState(keep);
  size_t b=out.find(">galleyq<");
  size_t e=out.rfind(">galleyend<");
  if(b == string::npos || e == string::npos || e < b) return out;
  return out.substr(b+9,e-b-9);
}

ssize_t iopipestream::readbuffer()
{
  if(!pipeopen) {*buffer=0; return 0;}
  if(delivered >= output.size() || resync) {
    bool sync=resync;
    resync=false;
    refresh();
    if(sync) {
      size_t m=output.rfind(">galleysync<");
      if(m != string::npos) delivered=m+12;
    }
  }
