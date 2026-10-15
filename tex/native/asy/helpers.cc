// Galley: three dimensions from TeX's answer, as ">dim(Xpt)dim" each
static bool galleyDims(const string& out, size_t& from, double& w, double& h,
                       double& d)
{
  double *v[3]={&w,&h,&d};
  for(int j=0; j < 3; ++j) {
    size_t a=out.find(">dim(",from);
    if(a == string::npos) return false;
    size_t b=out.find("pt)dim",a);
    if(b == string::npos) return false;
    try {
      *v[j]=lexical::cast<double>(out.substr(a+5,b-a-5),true)*tex2ps;
    } catch(lexical::bad_cast&) {return false;}
    from=b+6;
  }
  return true;
}

static string galleyQuestion(const string& s)
{
  ostringstream q;
  q << "\\setbox\\ASYbox=\\hbox{" << stripblanklines(s) << "}\n\n";
  const char *dims[]={"wd","ht","dp"};
  for(int j=0; j < 3; ++j)
    q << "\\immediate\\write16{>dim(\\the\\" << dims[j] << "\\ASYbox)dim}\n";
  return q.str();
}

// the font commands setpen would send, as text
static string galleyFont(const string& texengine, const pen& pentype)
{
  ostringstream f;
  bool Latex=latex(texengine);
  if(Latex && setlatexfont(f,pentype,drawElement::lastpen)) f << "\n";
  if(settexfont(f,pentype,drawElement::lastpen,Latex)) f << "\n";
  drawElement::lastpen=pentype;
  return f.str();
}
