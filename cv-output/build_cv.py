from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_ROW_HEIGHT_RULE
D=Document(); s=D.sections[0]
s.page_width=Cm(21); s.page_height=Cm(29.7)
s.top_margin=s.bottom_margin=Cm(.65); s.left_margin=s.right_margin=Cm(.65)
normal=D.styles['Normal']; normal.font.name='Arial'; normal.font.size=Pt(10)
normal.font.color.rgb=RGBColor.from_string('333C4D')
normal.paragraph_format.space_after=Pt(6)
normal.paragraph_format.line_spacing=1.08
T=D.add_table(rows=2, cols=2); T.alignment=WD_TABLE_ALIGNMENT.CENTER; T.autofit=False
T.columns[0].width=Cm(6.1); T.columns[1].width=Cm(13.6)
for row in T.rows:
 for i,c in enumerate(row.cells):
  c.width=Cm([6.1,13.6][i]); c.vertical_alignment=WD_CELL_VERTICAL_ALIGNMENT.TOP
  pr=c._tc.get_or_add_tcPr(); margins=OxmlElement('w:tcMar')
  for k,v in [('top','280'),('bottom','200'),('left','380'),('right','330')]:
   e=OxmlElement('w:'+k); e.set(qn('w:w'),v); e.set(qn('w:type'),'dxa'); margins.append(e)
  pr.append(margins)
  borders=OxmlElement('w:tcBorders')
  for k in ['top','left','bottom','right']:
   e=OxmlElement('w:'+k); e.set(qn('w:val'),'nil'); borders.append(e)
  pr.append(borders)
  shade=OxmlElement('w:shd'); shade.set(qn('w:fill'),'333C4D' if row==T.rows[0] else 'FFFFFF')
  pr.append(shade)
def fill(c,color):
 c._tc.get_or_add_tcPr().find(qn('w:shd')).set(qn('w:fill'),color)
for c in T.rows[0].cells: fill(c,'333C4D')
fill(T.cell(1,0),'E5E5E5')
T.rows[0].height=Cm(4.6); T.rows[0].height_rule=WD_ROW_HEIGHT_RULE.AT_LEAST
T.rows[1].height=Cm(22.8); T.rows[1].height_rule=WD_ROW_HEIGHT_RULE.AT_LEAST

def p(c,text,size=10,bold=False,color='333C4D',before=0,after=6):
 para=c.paragraphs[0] if len(c.paragraphs)==1 and not c.paragraphs[0].text else c.add_paragraph()
 para.paragraph_format.space_before=Pt(before); para.paragraph_format.space_after=Pt(after)
 r=para.add_run(text); r.bold=bold; r.font.size=Pt(size); r.font.color.rgb=RGBColor.from_string(color)
 return para

def heading(c,text):
 para=p(c,text,12,True,before=17,after=9)
 pp=para._p.get_or_add_pPr(); border=OxmlElement('w:pBdr'); b=OxmlElement('w:bottom'); b.set(qn('w:val'),'single'); b.set(qn('w:sz'),'4'); b.set(qn('w:color'),'65738A'); b.set(qn('w:space'),'5'); border.append(b); pp.append(border)

a=p(T.cell(0,0),'[Optional photo]',10,False,'FFFFFF',before=34); a.alignment=WD_ALIGN_PARAGRAPH.CENTER
p(T.cell(0,1),'[FULL NAME]',24,True,'FFFFFF',before=21,after=9)
p(T.cell(0,1),'[ROLE YOU ARE APPLYING FOR]',11,False,'FFFFFF')
l=T.cell(1,0); r=T.cell(1,1)
heading(l,'CONTACT')
for t in ['[Phone number]','[Email address]','[Town or suburb]','[Portfolio link if relevant]']: p(l,t,9)
heading(l,'SKILLS')
for t in ['Table service','Table clearing','Photography','Photo editing','Video editing','Social media content']: p(l,'• '+t,9)
heading(l,'LANGUAGES')
p(l,'[Language and level]',9); p(l,'[Language and level]',9)
heading(l,'AVAILABILITY')
p(l,'[Start date]',9); p(l,'[Days and shifts available]',9)
heading(l,'REFERENCE')
p(l,'[Name and role]',9); p(l,'[Organisation]',9); p(l,'[Phone or email]',9)
heading(r,'PROFILE')
p(r,'Entry-level candidate with experience in table service, photography, photo editing, video editing and social media content. Seeking a [target role] where I can contribute these skills and develop further through practical experience.')
heading(r,'WORK EXPERIENCE')
p(r,'Waitress',11,True,after=3)
p(r,'[Venue or event]  |  [Month year to month year]',9,after=8)
p(r,'• Served customers at tables.')
p(r,'• Cleared and cleaned tables after service.')
p(r,'[Add one specific example after answering the questions.]',9)
p(r,'Photography and digital content',11,True,before=13,after=3)
p(r,'[Employer or project]  |  [Dates and work arrangement]',9,after=8)
p(r,'• Took photographs and edited images, including model shoots and weddings.')
p(r,'• Edited video content and created social media posts.')
p(r,'[Add software, project scope and a verified result.]',9)
heading(r,'EDUCATION')
p(r,'[Highest school grade or qualification completed]',10,True)
p(r,'[School name]  |  [Year]',9)
p(r,'[Relevant short course, if completed]',9)
D.core_properties.title='Editable entry level CV'; D.core_properties.author=''
D.save('C:/Business Projects/konnx/cv-output/Editable CV.docx')
