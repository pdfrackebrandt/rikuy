// a picture's new labels in one run of TeX
void drawLabel::measureMany(mem::vector<drawLabel*>& labels, iopipestream& tex,
                            const string& texengine)
{
  string q,keep;
  mem::vector<drawLabel*> asked;
  for(size_t i=0; i < labels.size(); ++i) {
    drawLabel *l=labels[i];
    if(l->havebounds || l->measured) continue;
    string f=galleyFont(texengine,l->pentype);
    keep += f;
    q += f+galleyQuestion(l->label);
    asked.push_back(l);
  }
  if(asked.empty()) return;
  string out=tex.query(q,keep);
  size_t from=0;
  for(size_t i=0; i < asked.size(); ++i) {
    drawLabel *l=asked[i];
    if(!galleyDims(out,from,l->width,l->height,l->depth)) break;
    l->measured=true;
  }
}

void drawLabel::getbounds(iopipestream& tex, const string& texengine)
{
  if(havebounds) return;
  havebounds=true;

  if(!measured) {
    setpen(tex,texengine,pentype);
    texbounds(width,height,depth,tex,label);
  }
