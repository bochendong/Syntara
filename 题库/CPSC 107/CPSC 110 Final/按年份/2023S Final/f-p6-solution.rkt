;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p6-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2023s-f/f-p6)




(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line
(@problem 6) ;do not edit or delete this line



(@htdd Node)
(define-struct node (name nexts))
;; Node is (make-node String (listof String))
;; interp. Nodes in a very simple graph.  Each node has a name and a list
;;         of the nodes to which it is connected.  The node names in nexts
;;         act as 'arrows' in the graph that point from the current node
;;         to next nodes.


(@htdd Map)
;; Map is ???
;; interp. an opaque data type that represents a map from node names to nodes.
;;         Only the provided function get-node knows how to work with a map.
;;
;; CONSTRAINT: A given map has no duplicate node names.
;;
;; We are giving you one map to work with called MAP, and the attached file
;; f-p6-figure.pdf includes a diagram of the graph represented by that map.
;; Do not assume that we will only test your function with that map.



;;
;; Here is a STRUCTURALLY RECURSIVE template for working with a graph of these
;; nodes.  Note that this template DOES NOT INCLUDE cycle detection. You will
;; have to add that.
;;
(define (fn-for-graph start-node-name map)  
  (local [(define (fn-for-node n prev path)
            (... (node-name n)
                 (fn-for-lonn (node-nexts n))))

          (define (fn-for-lonn lonn)
            (cond [(empty? lonn) (...)]
                  [else
                   (... (fn-for-node-name (first lonn))
                        (fn-for-lonn (rest lonn)))]))

          (define (fn-for-node-name nn)
            (fn-for-node (get-node nn map)))]  ;this is a generative step

    (fn-for-node-name start-node-name)))



(@htdf joins)
(@signature String Map -> (listof String))
;; produce names of nodes where >= 2 arrows enter; ignoring arrows in cycles

(check-expect (joins "A" MAP) (list "D" "F"))
(check-expect (joins "B" MAP) (list "D" "F"))
(check-expect (joins "C" MAP) (list "D" "F"))
(check-expect (joins "D" MAP) (list "F"))
(check-expect (joins "E" MAP) (list "F"))
(check-expect (joins "F" MAP) (list))
(check-expect (joins "G" MAP) (list))

(@template-origin genrec Node (listof String) String accumulator)

(define (joins start map)
  ;; nn-wl   is (listof String); worklist of node names to visit
  ;; path-wl is (listof (listof String)); tandem worklist of paths
  ;; visited is (listof String); name of every node visited in TR
  ;; rsf is (listof String); result so far
  (local [(define (fn-for-node n path nn-wl path-wl visited rsf)
            (local [(define name (node-name n))
                    (define npath    (cons name path))
                    (define nvisited (cons name visited))]
              (cond [(member name rsf)
                     (fn-for-lonn nn-wl path-wl visited rsf)]
                    [(member name path)
                     (fn-for-lonn nn-wl path-wl visited rsf)]
                    [(member name visited)
                     (fn-for-lonn nn-wl path-wl visited (cons name rsf))]
                    [else
                     (fn-for-lonn (append (node-nexts n) nn-wl)
                                  (append (make-list (length (node-nexts n))
                                                     npath)
                                          path-wl)
                                  nvisited
                                  rsf)])))

          (define (fn-for-lonn nn-wl path-wl visited rsf)
            (cond [(empty? nn-wl) rsf]
                  [else
                   (fn-for-node-name (first nn-wl)
                                     (first path-wl)
                                     (rest  nn-wl)
                                     (rest  path-wl)
                                     visited
                                     rsf)]))

          (define (fn-for-node-name nn path nn-wl path-wl visited rsf)
            (fn-for-node
             (get-node nn map) path nn-wl path-wl visited rsf))]

    (fn-for-node-name start empty empty empty empty empty)))



;;
;; Consider this to be a primitive function that comes with the data definitions
;; and that given a node name it produces the corresponding node.  Because this
;; consumes a string and generates a node calling it will amount to a generative
;; step in a recursion through a map of nodes.
;;
(@htdf get-node)
(@signature String -> Node)

(define (get-node name map)
  (local [(define (scan lon)
            (cond [(empty? lon) (error "No node named " name)]
                  [else
                   (if (string=? (node-name (first lon)) name)
                       (first lon)
                       (scan (rest lon)))]))]
    (scan map)))




(define MAP
  (list (make-node "A" (list "B"))
        (make-node "B" (list "A" "C"))
        (make-node "C" (list "E" "D" "F"))
        (make-node "D" (list "E" "F" "G"))
        (make-node "E" (list "D"))
        (make-node "F" (list))
        (make-node "G" (list "F"))))
